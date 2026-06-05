FROM alpine:3.19
RUN apk add --no-cache openssh-client sshpass netcat-openbsd
COPY entrypoint.sh /entrypoint.sh
# Windows guarda CRLF: sin esto falla "exec /entrypoint.sh: no such file or directory"
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
EXPOSE 3306
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
