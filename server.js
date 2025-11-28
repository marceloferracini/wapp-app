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

// Configuração do histórico: mantém últimos 3 pares de conversa
// Cada par = 1 mensagem do usuário + 1 resposta do assistant = 2 mensagens
// Total: 3 pares = 6 mensagens no histórico
const MAX_HISTORY_PAIRS = 3;

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
    
    // Prepara mensagens para enviar à OpenAI (system + histórico + mensagem atual)
    const messagesForOpenAI = [
      {
        role: "system",
        content: `Você é um assistente virtual da Humanizi AI. Seja simpático, casual e conversacional. 
Responda de forma MUITO CONCISA: máximo 1-2 frases curtas, no máximo 50 palavras ou 200 caracteres. 
WhatsApp é para mensagens rápidas e objetivas. Seja natural e amigável, como se estivesse conversando com um amigo.`
      },
      ...history, // Histórico de conversas anteriores
      {
        role: "user",
        content: userText
      }
    ];

    console.log(`[Contexto] 📚 Enviando ${history.length} mensagens anteriores + mensagem atual para OpenAI`);

    // Gera resposta com OpenAI
    let reply = `Olá ${firstName}. Tudo bem ?\nAqui é da Humanizi AI, no que posso te ajudar ?`;
    
    if (OPENAI_API_KEY) {
      try {
        console.log('[OpenAI] 🤖 Gerando resposta...');
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: messagesForOpenAI,
          max_tokens: 120,
          temperature: 0.7
        });
        
        reply = completion.choices[0].message.content;
        
        // Trunca resposta se passar de 200 caracteres (segurança extra)
        if (reply.length > 200) {
          reply = reply.substring(0, 197) + '...';
          console.log('[OpenAI] ⚠️ Resposta truncada para 200 caracteres');
        }
        
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
        reply = `Desculpe ${firstName}, estou com dificuldades técnicas no momento. Pode repetir?`;
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
