# Deploy no Render

## Web Service

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Instance Type: Free (para testes/apresentação)

O servidor usa `process.env.PORT` e escuta em `0.0.0.0`, compatível com o Render.

## Atenção ao banco

O projeto atualmente usa `backend/db.json`. Isso é adequado apenas para testes/demonstrações.
Para produção, migre os dados para PostgreSQL antes de usar dados reais.

## Dados

Não publique dados reais de pacientes em uma instância pública de demonstração.
