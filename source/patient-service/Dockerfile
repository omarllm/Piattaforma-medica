# source/patient-service/Dockerfile
FROM node:22-bookworm

ENV NODE_ENV=production \
    TZ=Europe/Rome \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install LibreOffice headless + font minime (DOCX/XLSX/PPTX → PDF)
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-draw \
      libreoffice-common \
      fonts-dejavu-core fonts-liberation \
      ghostscript ca-certificates curl; \
    ln -snf /usr/share/zoneinfo/Europe/Rome /etc/localtime && echo Europe/Rome > /etc/timezone; \
    apt-get clean; rm -rf /var/lib/apt/lists/*

# Dipendenze Node (cache-friendly)
COPY package*.json ./
RUN npm ci --omit=dev

# Codice applicazione
COPY . .

EXPOSE 4002
CMD ["npm", "start"]
