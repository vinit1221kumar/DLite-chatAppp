# Auth Service Dockerfile (Python)
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PORT=4001
EXPOSE 4001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4001"]
