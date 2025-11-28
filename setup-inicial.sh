#!/bin/bash

###############################################################################
# Script de Setup Inicial - WAPP Webhook
# Execute este script na primeira vez que configurar o servidor
###############################################################################

set -e  # Parar em caso de erro

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_NAME="wapp-webhook"
APP_DIR=$(pwd)

function log_step() {
  local step="$1"
  local message="$2"
  echo -e "${BLUE}[${step}]${NC} ${message}"
}

function log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

function log_error() {
  echo -e "${RED}❌${NC} $1"
}

function log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Setup Inicial - WhatsApp Webhook${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
  log_error "Arquivo package.json não encontrado!"
  log_error "Execute este script no diretório raiz do projeto."
  exit 1
fi

# 1. Verificar Node.js
log_step "1/6" "Verificando Node.js..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  log_success "Node.js encontrado: $NODE_VERSION"
  
  # Verificar se é versão 18+
  NODE_MAJOR=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    log_error "Node.js 18+ é necessário. Versão atual: $NODE_VERSION"
    log_warn "Instale Node.js 18+ e execute este script novamente."
    exit 1
  fi
else
  log_error "Node.js não encontrado!"
  log_warn "Instale Node.js 18+ primeiro:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi

# 2. Verificar npm
log_step "2/6" "Verificando npm..."
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version)
  log_success "npm encontrado: $NPM_VERSION"
else
  log_error "npm não encontrado!"
  exit 1
fi

# 3. Instalar PM2
log_step "3/6" "Verificando/Instalando PM2..."
if command -v pm2 &> /dev/null; then
  PM2_VERSION=$(pm2 --version)
  log_success "PM2 já instalado: v$PM2_VERSION"
else
  log_warn "PM2 não encontrado. Instalando globalmente..."
  sudo npm install -g pm2
  if command -v pm2 &> /dev/null; then
    log_success "PM2 instalado com sucesso"
  else
    log_error "Falha ao instalar PM2"
    exit 1
  fi
fi

# 4. Instalar dependências
log_step "4/6" "Instalando dependências do projeto..."
npm ci --production
log_success "Dependências instaladas"

# 5. Configurar .env
log_step "5/6" "Configurando variáveis de ambiente..."
if [ ! -f .env ]; then
  if [ -f ENV.example ]; then
    cp ENV.example .env
    log_success "Arquivo .env criado a partir de ENV.example"
    log_warn "IMPORTANTE: Edite o arquivo .env e preencha todas as variáveis:"
    echo "  nano .env"
    echo ""
    echo "  Variáveis necessárias:"
    echo "  - WHATSAPP_TOKEN"
    echo "  - PHONE_NUMBER_ID"
    echo "  - VERIFY_TOKEN"
    echo "  - PORT (padrão: 3000)"
    echo "  - OPENAI_API_KEY (opcional)"
    echo ""
    read -p "Pressione Enter após configurar o .env para continuar..."
  else
    log_error "Arquivo ENV.example não encontrado!"
    exit 1
  fi
else
  log_success "Arquivo .env já existe"
fi

# Verificar se .env tem conteúdo
if [ ! -s .env ]; then
  log_error "Arquivo .env está vazio!"
  exit 1
fi

# 6. Criar diretório de logs
log_step "6/6" "Criando estrutura de diretórios..."
mkdir -p logs
log_success "Diretório de logs criado"

# 7. Configurar PM2 para iniciar no boot
log_step "7/6" "Configurando PM2 para iniciar no boot..."
STARTUP_CMD=$(pm2 startup | grep -o "sudo.*" || echo "")
if [ -n "$STARTUP_CMD" ]; then
  log_warn "Execute o seguinte comando para configurar PM2 no boot:"
  echo "  $STARTUP_CMD"
  echo ""
  read -p "Deseja executar agora? (s/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Ss]$ ]]; then
    eval $STARTUP_CMD
    log_success "PM2 configurado para iniciar no boot"
  else
    log_warn "Você pode executar depois: $STARTUP_CMD"
  fi
fi

# 8. Iniciar aplicação
echo ""
log_step "8/6" "Iniciando aplicação com PM2..."
if [ -f ecosystem.config.js ]; then
  pm2 start ecosystem.config.js
  log_success "Aplicação iniciada usando ecosystem.config.js"
else
  pm2 start server.js --name "$APP_NAME"
  log_success "Aplicação iniciada diretamente"
fi

pm2 save
log_success "Configuração do PM2 salva"

# Resumo final
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup concluído com sucesso!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Comandos úteis:"
echo "  pm2 status              - Ver status da aplicação"
echo "  pm2 logs $APP_NAME      - Ver logs em tempo real"
echo "  pm2 restart $APP_NAME   - Reiniciar aplicação"
echo "  pm2 stop $APP_NAME       - Parar aplicação"
echo "  pm2 monit               - Monitor de recursos"
echo ""
echo "Próximos passos:"
echo "  1. Configure o firewall para permitir a porta (ex: sudo ufw allow 3000/tcp)"
echo "  2. Configure o webhook na Meta Developer Console"
echo "  3. Teste enviando uma mensagem para o número configurado"
echo ""
log_success "Aplicação está rodando!"

