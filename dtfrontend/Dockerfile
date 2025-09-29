# Multi-stage build for Next.js application
FROM node:20-alpine

WORKDIR /app

COPY dtfrontend/package*.json ./
#RUN npm install --registry=http://ftp.aselsan.com.tr:8081/repository/npm/ --force
RUN npm install

COPY dtfrontend .

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"] 