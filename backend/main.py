import os
import traceback
import boto3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load variables from local .env file (ignored in production like Render)
load_dotenv()

app = FastAPI(title="Insphired Infrastructure API", version="1.0")

# CRITICAL: Allow your Vercel frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, you can restrict this to your Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
REGION = os.getenv("AWS_DEFAULT_REGION", "eu-west-3")
ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")

# Safety check for production deployment
if not ACCESS_KEY or not SECRET_KEY:
    print("⚠️ WARNING: AWS Credentials missing. API will fail unless environment variables are set.")

try:
    # Initialize the Lightsail boto3 client
    lightsail_client = boto3.client(
        'lightsail', 
        region_name=REGION,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY
    )
except Exception as e:
    print(f"Failed to initialize AWS client: {e}")
    lightsail_client = None

@app.get("/api/v1/health")
def root_health():
    return {"status": "online", "timestamp": datetime.utcnow().isoformat()}

@app.get("/api/v1/services")
def get_live_aws_services():
    if not lightsail_client:
        raise HTTPException(status_code=500, detail="AWS client not initialized. Check credentials.")

    try:
        # Fetch Lightsail virtual private servers
        response = lightsail_client.get_instances()
        services = []
        
        for index, instance in enumerate(response.get('instances', []), start=1):
            instance_name = instance['name']
            state_name = instance.get('state', {}).get('name', 'unknown')
            bundle_id = instance.get('bundleId', 'lightsail-plan')
            
            cpu_usage = 0.0
            status = "healthy" if state_name == "running" else "down"
            
            # Fetch CPU metrics only for running instances
            if state_name == "running":
                end_time = datetime.utcnow()
                start_time = end_time - timedelta(minutes=15)
                try:
                    metric_response = lightsail_client.get_instance_metric_data(
                        instanceName=instance_name,
                        metricName='CPUUtilization',
                        period=300,
                        startTime=start_time,
                        endTime=end_time,
                        unit='Percent',
                        statistics=['Average']
                    )
                    data_points = metric_response.get('metricData', [])
                    if data_points:
                        sorted_points = sorted(data_points, key=lambda x: x['timestamp'])
                        cpu_usage = round(sorted_points[-1].get('average', 0.0), 2)
                        
                        # Automatically flag as degraded if CPU is high
                        if cpu_usage > 85:
                            status = "degraded"
                            
                except Exception as metric_err:
                    print(f"Notice: Could not fetch metrics for {instance_name}: {metric_err}")
                    cpu_usage = 0.0

            # Note: Lightsail doesn't provide direct Memory or Latency via this API.
            # We provide mock/placeholder values here for the dashboard to render correctly.
            services.append({
                "id": str(index),
                "name": instance_name,
                "type": f"Lightsail ({bundle_id})",
                "status": status,
                "cpu": cpu_usage,
                "memory": 45.0, # Placeholder
                "latency": 24   # Placeholder
            })
            
        return services
    
    except Exception as e:
        print("--- LIGHTSAIL API ERROR TRACEBACK ---")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"AWS API Error: {str(e)}")