# nasaq-monitoring targets-manager — خفيف بلا اعتماديات
FROM node:20-alpine
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV PORT=8080
EXPOSE 8080
# نُشغّله بمستخدم node — المجلدات المربوطة تُضبط ملكيتها في install.sh
USER node
CMD ["node", "server.js"]
