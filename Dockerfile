# syntax=docker/dockerfile:1
FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WORKFLOWS_DATA_DIR=/data

WORKDIR /app

# The app has no runtime dependencies, so only the source is needed.
COPY package.json server.js ./
COPY public ./public

RUN mkdir -p /data && chown node:node /data
USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/workflows').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
