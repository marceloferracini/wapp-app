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

## Migração para Novo Servidor

📖 **Guia Completo:** Consulte [MIGRACAO-SERVIDOR.md](./MIGRACAO-SERVIDOR.md) para instruções detalhadas passo a passo.

### Setup Rápido

1. Clone o repositório no servidor
2. Execute o script de setup:
   ```bash
   chmod +x setup-inicial.sh
   ./setup-inicial.sh
   ```
3. Configure o `.env` quando solicitado
4. A aplicação será iniciada automaticamente

### Deploy Automático

Para atualizações futuras:
```bash
./deploy-auto.sh
```

### Configurar Nginx + SSL (HTTPS)

Para expor a aplicação via HTTPS sem especificar porta:

📖 **Guia Completo:** Consulte [CONFIGURAR-NGINX-SSL.md](./CONFIGURAR-NGINX-SSL.md)

**Setup Automatizado:**
```bash
sudo ./setup-nginx-ssl.sh
```

O script vai:
- Configurar Nginx como proxy reverso
- Instalar e configurar Certbot (Let's Encrypt)
- Obter certificado SSL automaticamente
- Configurar redirect HTTP → HTTPS

**URL final:** `https://webhook.humanizi.ai/webhook`

### Arquivos de Configuração

- `ecosystem.config.js`: configuração do PM2
- `setup-inicial.sh`: script de setup inicial
- `deploy-auto.sh`: script de deploy automático
- `setup-nginx-ssl.sh`: script de configuração Nginx + SSL
- `nginx-webhook.humanizi.ai.conf`: template de configuração Nginx

