FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PORT=4002
EXPOSE 4002

CMD ["uvicorn", "app.main:asgi_app", "--host", "0.0.0.0", "--port", "4002"]
