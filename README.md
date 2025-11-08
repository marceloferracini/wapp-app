# WhatsApp Cloud API Webhook

Webhook server em Node.js/Express que integra WhatsApp Cloud API com OpenAI para respostas automtically personalizadas.

## Requisitos
- Node.js 18+
- Conta WhatsApp Cloud API configurada
- Credenciais OpenAI (opcional, para respostas generativas)

## Configura4tion
1. Copie o arquivo `ENV.example` para `.env` e preencha:
   ```bash
   cp ENV.example .env
   ```
   Configure:
   - `WHATSAPP_TOKEN`
   - `PHONE_NUMBER_ID`
   - `VERIFY_TOKEN`
   - `PORT`
   - `OPENAI_API_KEY` (opcional)

2. Instale dependncias:
   ```bash
   npm install
   ```

3. Rode em ambiente local:
   ```bash
   npm start
   ```

Exponha via ngrok (ou outro tnel) e configure o webhook na Meta.

## Deploy
1. Copie os arquivos para o servidor cloud.
2. Configure variveis de ambiente no servidor.
3. Instale dependncias e execute `npm start` ou configure um process manager (PM2/systemd).

## Estrutura
- `server.js`: servidor Express
- `package.json`: dependncias e scripts

## Segurança
- Nunca commite `.env`
- Regere tokens periodicamente

