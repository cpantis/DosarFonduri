FROM node:20-slim

RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install --break-system-packages PyMuPDF python-docx openpyxl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
