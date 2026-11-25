# syntax=docker/dockerfile:1
FROM python:3.14-slim@sha256:22eafb370920ad8b429e0aec3fff433e0669968519f5d60469d83729c138b28b
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Subregator Frontend" \
      org.opencontainers.image.source="https://github.com/subregator/subregator-frontend" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SUBREGATOR_CHECKS_DIR=/var/lib/subregator-checks
WORKDIR /app
RUN mkdir -p /var/lib/subregator-checks && chown 65532:65532 /var/lib/subregator-checks
COPY LICENSE ./
COPY index.html serve.py verification.py ./
USER 65532:65532
VOLUME ["/var/lib/subregator-checks"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=3).read()"]
ENTRYPOINT ["python3", "serve.py", "--bind", "0.0.0.0", "--port", "8080"]
