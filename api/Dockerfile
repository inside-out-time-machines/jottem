# Jottem API - EUPL-1.2
# Fase 1: mail-templates compileren (MJML -> Jinja2-klare HTML)
# build.sh vereist bash en python3 (partial-expansie); een gefaalde build moet de
# imagebuild breken, anders vallen alle mails stilletjes terug op tekst-only
FROM node:22-alpine AS mail
RUN apk add --no-cache bash python3
WORKDIR /bouw
COPY templates/mail/ templates/mail/
RUN cd templates/mail && bash build.sh && test -s dist/nl/uitnodiging-organisatiebeheerder.html.j2

# Fase 2: Python-runtime
FROM python:3.12-slim
WORKDIR /srv/api
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# libvips voor de derivatenpipeline (pyramidal TIFF voor Cantaloupe)
RUN apt-get update && apt-get install -y --no-install-recommends libvips42 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY alembic.ini .
COPY alembic/ alembic/
COPY templates/ templates/
COPY --from=mail /bouw/templates/mail/dist/ templates/mail/dist/

# niet als root draaien: een fout in de applicatie mag geen rootrechten in de container geven
RUN useradd --create-home --uid 10001 jottem && chown -R jottem:jottem /srv/api
USER jottem

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
