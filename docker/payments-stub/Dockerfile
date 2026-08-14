# Node 22 strips TypeScript types natively, so this needs no build step and no
# dependencies — the stub stays a single file.
FROM node:22-alpine

WORKDIR /srv
COPY package.json server.ts ./

USER node
EXPOSE 4001
CMD ["node", "server.ts"]
