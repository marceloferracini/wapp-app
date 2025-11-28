#!/bin/bash

###############################################################################
# Script de Deploy Automático - WAPP Webhook
# Versão sem interatividade (para CI/CD ou automação)
###############################################################################

set -e  # Parar em caso de erro

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_NAME="wapp-webhook"
BRANCH="main"

function log_step() {
  local step="$1"
  local message="$2"
  echo -e "${BLUE}[${step}]${NC} ${message}"
}

log_step "1/5" "Atualizando código do GitHub..."
git pull origin "$BRANCH"

log_step "2/5" "Instalando dependências de produção..."
npm ci --production --quiet

log_step "3/5" "Sincronizando variáveis de ambiente (.env)..."
if [ ! -f .env ]; then
  echo -e "${RED}Arquivo .env não encontrado! Crie ou copie antes de continuar.${NC}"
  exit 1
fi

log_step "4/5" "Reiniciando PM2 (${APP_NAME})..."

# Criar diretório de logs se não existir
mkdir -p logs

# Detectar o comando PM2 (pode estar em diferentes locais)
if command -v pm2 &> /dev/null; then
    PM2_CMD="pm2"
elif [ -f /usr/local/bin/pm2 ]; then
    PM2_CMD="/usr/local/bin/pm2"
elif [ -f /usr/bin/pm2 ]; then
    PM2_CMD="/usr/bin/pm2"
elif [ -f ~/.npm-global/bin/pm2 ]; then
    PM2_CMD="$HOME/.npm-global/bin/pm2"
else
    # Tentar usar npx como fallback
    PM2_CMD="npx pm2"
fi

# Verificar se o PM2 está realmente disponível
if ! $PM2_CMD --version &> /dev/null; then
    echo -e "${RED}Erro: PM2 não foi encontrado. Instale com: npm install -g pm2${NC}"
    exit 1
fi

# Verificar se o processo já existe
if $PM2_CMD list | grep -q "$APP_NAME"; then
    # Processo existe, apenas reinicia
    $PM2_CMD restart "$APP_NAME"
else
    # Processo não existe, inicia pela primeira vez
    if [ -f ecosystem.config.js ]; then
        echo -e "${BLUE}Usando ecosystem.config.js para iniciar...${NC}"
        $PM2_CMD start ecosystem.config.js
    else
        echo -e "${BLUE}Iniciando processo diretamente...${NC}"
        $PM2_CMD start server.js --name "$APP_NAME"
    fi
    $PM2_CMD save
fi

log_step "5/5" "Verificando status do processo..."
$PM2_CMD list | grep "$APP_NAME" || echo -e "${RED}Processo não encontrado!${NC}"

echo -e "${GREEN}✓${NC} Deploy concluído com sucesso!"
