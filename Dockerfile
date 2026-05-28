FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY ai/requirements.txt ./ai/
RUN pip3 install --no-cache-dir -r ai/requirements.txt --break-system-packages

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
