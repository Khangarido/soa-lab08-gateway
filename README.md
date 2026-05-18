# soa-api-gateway
API Gateway for SOA Lab 08 with Redis caching.

## Routes
- /api/users/** -> JSON Service
- /api/soap/** -> SOAP Service
- /api/files/** -> File Manager
- /health -> Gateway health

## Run
npm install && cp .env.example .env && npm start

## Deploy with pm2
npm install -g pm2
pm2 start src/gateway.js --name soa-gateway
pm2 save && pm2 startup