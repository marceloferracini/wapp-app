// server.js
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(bodyParser.json());

// Middleware para aceitar header do ngrok-free
app.use((req, res, next) => {
  res.header('ngrok-skip-browser-warning', 'true');
  next();
});

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Inicializa OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Armazena histórico de conversas por usuário (número de telefone como chave)
// Estrutura: Map<telefone, Array<{role: 'user'|'assistant', content: string}>>
const conversationHistory = new Map();

// Configuração do histórico: mantém últimos 10 pares de conversa
// Cada par = 1 mensagem do usuário + 1 resposta do assistant = 2 mensagens
// Total: 10 pares = 20 mensagens no histórico
const MAX_HISTORY_PAIRS = 10;

// 1️⃣ Validação do Webhook (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] ✅ Verificado com sucesso');
    res.status(200).send(challenge);
  } else {
    console.warn('[Webhook] ❌ Falha na verificação');
    res.sendStatus(403);
  }
});

// 2️⃣ Receber mensagens (POST)
app.post('/webhook', async (req, res) => {
  console.log('[Webhook] 🔔 Evento recebido:', JSON.stringify(req.body, null, 2));

  // Extrai dados do webhook
  const change = req.body.entry?.[0]?.changes?.[0];
  const value = change?.value || {};
  
  // Verifica se é evento de status (sent, delivered, read, etc.)
  if (value.statuses && value.statuses.length > 0) {
    const status = value.statuses[0];
    console.log(`[Webhook] 📊 Status de mensagem: ${status.status} para ${status.recipient_id} (ID: ${status.id})`);
    res.sendStatus(200);
    return;
  }

  // Tenta extrair mensagens
  let messages = value.messages;
  let contacts = value.contacts;
  
  // Se não encontrou na estrutura padrão, tenta estrutura alternativa
  if (!messages) {
    messages = req.body.value?.messages;
  }
  if (!contacts) {
    contacts = req.body.value?.contacts;
  }
  
  // Se ainda não encontrou, pode ser que o payload esteja em formatos diferentes
  if (!messages && req.body.changes) {
    messages = req.body.changes[0]?.value?.messages;
    contacts = req.body.changes[0]?.value?.contacts;
  }
  
  console.log('[Debug] Mensagens extraídas:', JSON.stringify(messages, null, 2));
  console.log('[Debug] Contatos extraídos:', JSON.stringify(contacts, null, 2));
  
  if (messages && messages[0]) {
    const message = messages[0];
    const messageType = message.type;
    
    // Ignora eventos de permissão de chamada e outros tipos interativos
    if (messageType === 'interactive' && message.interactive) {
      const interactiveType = message.interactive.type;
      
      if (interactiveType === 'call_permission_reply') {
        const from = contacts?.[0]?.wa_id || message.from;
        const fullName = contacts?.[0]?.profile?.name || '';
        const firstName = fullName.split(' ')[0] || '';
        const callPermission = message.interactive.call_permission_reply;
        const response = callPermission?.response;
        const isPermanent = callPermission?.is_permanent;
        const expirationTimestamp = callPermission?.expiration_timestamp;
        
        console.log(`[Webhook] 📞 Permissão de chamada ${response} por ${firstName} (${from})`);
        
        if (isPermanent) {
          console.log(`[Webhook] ✅ Permissão permanente`);
        } else if (expirationTimestamp) {
          const expirationDate = new Date(expirationTimestamp * 1000);
          console.log(`[Webhook] ⏰ Expira em: ${expirationDate.toISOString()}`);
        }
        
        res.sendStatus(200);
        return;
      }
      
      // Outros tipos interativos (botões, listas, etc.)
      console.log(`[Webhook] 🎛️ Evento interativo ignorado: ${interactiveType}`);
      res.sendStatus(200);
      return;
    }
    
    // Ignora outros tipos de mensagem que não sejam texto
    if (messageType !== 'text') {
      console.log(`[Webhook] 📎 Mensagem do tipo '${messageType}' ignorada (não é texto)`);
      res.sendStatus(200);
      return;
    }
    
    // Processa apenas mensagens de texto
    const from = contacts?.[0]?.wa_id || message.from;
    const userText = message.text?.body;
    
    // Valida se tem texto válido
    if (!userText || userText.trim().length === 0) {
      console.log(`[Webhook] ⚠️ Mensagem de texto vazia recebida de ${from}`);
      res.sendStatus(200);
      return;
    }
    
    // Extrai o primeiro nome do contato
    const fullName = contacts?.[0]?.profile?.name || '';
    const firstName = fullName.split(' ')[0] || '';

    console.log(`[Webhook] 💬 Mensagem de texto recebida de ${firstName} (${from}): ${userText}`);

    // Obtém ou cria histórico de conversa para este usuário
    let history = conversationHistory.get(from) || [];
    
    // Verifica se é a primeira mensagem (histórico vazio)
    const isFirstMessage = history.length === 0;
    
    // Prepara o prompt do sistema com informações do usuário se disponível
    let systemPrompt = `# PAPEL

Você é um assistente virtual da Unopar. Sua função é ajudar pessoas interessadas em começar uma graduação, apresentando cursos disponíveis, modalidades e valores aproximados de mensalidade, e guiando o usuário até o início da inscrição.

# TOM E ESTILO

- Fale de forma clara, amigável e objetiva.
- Use frases curtas.
- Não dê informações complexas, apenas o essencial.
- Seja prestativo e ajude o usuário a encontrar o curso ideal.

# OBJETIVOS PRINCIPAIS

1. Perguntar qual curso ou área de interesse o usuário deseja.
2. Mostrar cursos de graduação oferecidos pela Unopar.
3. Informar modalidades disponíveis (EAD, semipresencial e presencial).
4. Apresentar valores aproximados de mensalidade, quando disponíveis.
5. Guiar o usuário para verificar disponibilidade no polo, enviar link de inscrição ou coletar dados básicos.

# CURSOS DISPONÍVEIS (LISTA REAL DE EXEMPLOS)

A Unopar oferece diversos cursos de graduação. Alguns cursos populares:

- Administração — EAD ou presencial — mensalidades a partir de **R$ 159,00**. 
- Gestão de Recursos Humanos — EAD ou presencial — a partir de **R$ 159,00**. 
- Educação Física — Licenciatura / Bacharelado — valores a partir de **R$ 173,99**. 
- Biomedicina — Semipresencial / Presencial — valores a partir de **R$ 197,99**. 
- Direito — presencial (valor depende do campus). 
- Enfermagem — presencial/semipresencial (valores variam por polo). 
- Psicologia — presencial/semipresencial. 
- Nutrição — presencial/semipresencial. 
- Engenharia Civil — presencial. 
- Análise e Desenvolvimento de Sistemas — EAD ou semipresencial — faixa histórica entre **R$ 474 e R$ 492**. 
- Ciências Contábeis — EAD — valores médios próximos de **R$ 309,00**. 

# IMPORTANTE SOBRE VALORES

- Os valores podem variar conforme modalidade (EAD / presencial / semipresencial), cidade, polo, promoções e época da matrícula.  
- Sempre ofereça verificar preço atualizado ou enviar o link oficial de matrícula.

# FLUXO SUGERIDO DE ATENDIMENTO

1. Cumprimente o usuário:${firstName ? ` Use o nome do usuário: "${firstName}"` : ''}  
   ${firstName ? `"Olá ${firstName}! Bem-vindo à Unopar. Qual curso de graduação você tem interesse em fazer?"` : '"Olá! Bem-vindo à Unopar. Qual curso de graduação você tem interesse em fazer?"'}

2. Se o usuário disser um curso:  
   - Informe se está disponível (EAD, semipresencial ou presencial).  
   - Informe o valor inicial aproximado, se existir.  
   - Pergunte se deseja verificar a disponibilidade no polo da cidade.

3. Se o usuário não souber qual curso fazer:  
   - Pergunte a área de interesse (ex.: saúde, exatas, gestão, educação).  
   - Sugira alguns cursos populares.

4. Convide a avançar para a inscrição:  
   "Quer que eu veja a disponibilidade para sua cidade ou prefere receber o link para iniciar sua inscrição agora?"

# REGRAS FINAIS

- Nunca invente valores exatos; sempre apresente como "a partir de" quando existir essa informação.  
- Para cursos sem valor visível, informe que "o valor depende do polo e da modalidade".  
- Se o usuário pedir algo que só humanos podem resolver (problemas de matrícula, histórico, documentos), diga que precisa encaminhar e solicite nome, telefone e e-mail.
- Seja objetivo mas prestativo. Adapte-se ao contexto da conversa mantendo o tom profissional e amigável.${firstName ? `\n- IMPORTANTE: O nome do usuário é "${firstName}". Use este nome quando apropriado, especialmente ao cumprimentar pela primeira vez.` : ''}`;
    
    // Prepara mensagens para enviar à OpenAI (system + histórico + mensagem atual)
    const messagesForOpenAI = [
      {
        role: "system",
        content: systemPrompt
      },
      ...history, // Histórico de conversas anteriores
      {
        role: "user",
        content: userText
      }
    ];

    console.log(`[Contexto] 📚 Enviando ${history.length} mensagens anteriores + mensagem atual para OpenAI`);

    // Gera resposta com OpenAI
    let reply = `Olá ${firstName}! Bem-vindo à Unopar. Qual curso de graduação você tem interesse em fazer?`;
    
    if (OPENAI_API_KEY) {
      try {
        console.log('[OpenAI] 🤖 Gerando resposta...');
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: messagesForOpenAI,
          max_tokens: 500,
          temperature: 0.7
        });
        
        reply = completion.choices[0].message.content;
        
        console.log('[OpenAI] ✅ Resposta gerada:', reply);
        console.log(`[OpenAI] 📊 Tamanho: ${reply.length} caracteres, ${reply.split(' ').length} palavras`);
        
        // Adiciona mensagem do usuário e resposta ao histórico
        history.push(
          { role: "user", content: userText },
          { role: "assistant", content: reply }
        );
        
        // Limita histórico aos últimos MAX_HISTORY_PAIRS pares (user + assistant)
        // Cada par = 2 mensagens, então MAX_HISTORY_PAIRS * 2 = total de mensagens
        const maxMessages = MAX_HISTORY_PAIRS * 2;
        if (history.length > maxMessages) {
          // Remove as mensagens mais antigas, mantendo apenas as últimas
          history = history.slice(-maxMessages);
          console.log(`[Contexto] 🧹 Histórico limitado a ${MAX_HISTORY_PAIRS} pares de conversa (${maxMessages} mensagens)`);
        }
        
        // Atualiza histórico no Map
        conversationHistory.set(from, history);
        console.log(`[Contexto] 💾 Histórico atualizado para ${from}: ${history.length} mensagens`);
        
      } catch (error) {
        console.error('[OpenAI] ❌ Erro ao gerar resposta:', error.message);
        reply = `Olá ${firstName}! Desculpe, estou com dificuldades técnicas no momento. Pode repetir sua mensagem?`;
      }
    }

    // Prepara o payload para envio
    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: from,
      type: "text",
      text: { body: reply },
    };

    // Log do POST que será enviado
    console.log('[POST Meta] URL:', url);
    console.log('[POST Meta] Body:', JSON.stringify(payload, null, 2));

    // Envia resposta
    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      
      console.log(`✅ Resposta enviada com sucesso para ${from}`);
      console.log('[POST Meta] Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
    }
  } else {
    // Nenhuma mensagem encontrada no evento
    console.log('[Webhook] ℹ️ Evento recebido sem mensagens processáveis');
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT, () =>
  console.log(`🚀 Servidor rodando na porta ${process.env.PORT}`)
);
