"""Object storage via het S3-protocol.

Tijdelijk een losstaande MinIO op de dev-server; de leverancierswissel naar externe
Object Storage is een configuratiewijziging (endpoint + keys), geen codewijziging.
"""
import boto3
from botocore.config import Config

from .config import settings


def _client(endpoint: str):
    cfg = settings()
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name="eu-central-1",
    )


def intern():
    return _client(settings().s3_endpoint)


def presigned_put(object_key: str, content_type: str, verloop_seconden: int = 900) -> str:
    """Presigned PUT op het publieke endpoint, zodat de browser direct kan uploaden."""
    client = _client(settings().s3_endpoint_publiek)
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings().s3_bucket_originals,
            "Key": object_key,
            "ContentType": content_type,
        },
        ExpiresIn=verloop_seconden,
    )


def presigned_get(object_key: str, verloop_seconden: int = 3600) -> str:
    client = _client(settings().s3_endpoint_publiek)
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings().s3_bucket_originals, "Key": object_key},
        ExpiresIn=verloop_seconden,
    )


def bestaat(object_key: str) -> bool:
    try:
        intern().head_object(Bucket=settings().s3_bucket_originals, Key=object_key)
        return True
    except intern().exceptions.ClientError:
        return False
