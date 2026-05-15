# BNPL ML Prediction Service

This service exposes a FastAPI `/predict` endpoint that the BNPL Node backend can call.

## Run locally

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8888
```

## Configure BNPL backend

Set:

```bash
PYTHON_PREDICTION_API_URL=http://127.0.0.1:8888/predict
```

The Node service in `server/src/services/mlPredictionService.js` already reads that URL by default.
