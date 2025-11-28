#!/bin/bash

###############################################################################
# Script para iniciar a app e expor via ngrok
###############################################################################

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Carrega variáveis do .env
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

PORT=${PORT:-8000}

LOG_FILE="app.log"
echo "" > "$LOG_FILE"  # Limpa log anterior

echo -e "${BLUE}Iniciando servidor na porta ${PORT}...${NC}"
echo -e "${BLUE}Logs sendo salvos em: $LOG_FILE${NC}"
echo -e "${BLUE}Para ver os logs em tempo real, abra outro terminal e execute:${NC}"
echo -e "${GREEN}  tail -f $LOG_FILE${NC}"
echo ""
echo -e "${BLUE}Pressione Ctrl+C para parar${NC}"
echo ""

# Inicia a app em background redirecionando logs para arquivo
npm start >> "$LOG_FILE" 2>&1 &
APP_PID=$!

# Aguarda a app iniciar
sleep 3

echo -e "${GREEN}✓ App rodando (PID: $APP_PID)${NC}"
echo -e "${BLUE}Iniciando ngrok na porta ${PORT}...${NC}"
echo ""

# Mata processos anteriores do ngrok na mesma porta
pkill -f "ngrok http $PORT" 2>/dev/null || true

# Inicia ngrok
ngrok http $PORT

# Quando ngrok parar (Ctrl+C), mata a app também
kill $APP_PID 2>/dev/null || true
echo -e "${RED}App encerrada${NC}"

