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

  // Tenta extrair mensagens de diferentes estruturas possíveis
  let messages = req.body.entry?.[0]?.changes?.[0]?.value?.messages;
  let contacts = req.body.entry?.[0]?.changes?.[0]?.value?.contacts;
  
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
    // Pega o número do remetente do contato, não do campo from da mensagem
    const from = contacts?.[0]?.wa_id || messages[0].from; // número do cliente
    const userText = messages[0].text?.body;
    
    // Extrai o primeiro nome do contato
    const fullName = contacts?.[0]?.profile?.name || '';
    const firstName = fullName.split(' ')[0] || '';

    console.log(`Mensagem recebida de ${from}: ${userText}`);

    // Gera resposta com OpenAI
    let reply = `Olá ${firstName}. Tudo bem ?\nAqui é da Humanizi AI, no que posso te ajudar ?`;
    
    if (OPENAI_API_KEY) {
      try {
        console.log('[OpenAI] Gerando resposta...');
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Você é um assistente virtual da Humanizi AI. Seja simpático, profissional e direto. Use no máximo 2 parágrafos.`
            },
            {
              role: "user",
              content: userText
            }
          ],
          max_tokens: 200,
          temperature: 0.7
        });
        
        reply = completion.choices[0].message.content;
        console.log('[OpenAI] Resposta gerada:', reply);
      } catch (error) {
        console.error('[OpenAI] Erro ao gerar resposta:', error.message);
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
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT, () =>
  console.log(`🚀 Servidor rodando na porta ${process.env.PORT}`)
);
