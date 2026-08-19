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


# De extensie komt uit het gecontroleerde content-type, niet uit de bestandsnaam: die is
# invoer van de client en kan met "../" buiten het bedoelde prefix schrijven.
EXTENSIE_PER_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/tiff": "tif",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
}


def extensie_voor(content_type: str, standaard: str = "bin") -> str:
    return EXTENSIE_PER_TYPE.get((content_type or "").split(";")[0].strip().lower(), standaard)


def presigned_put(
    object_key: str, content_type: str, verloop_seconden: int = 900, bucket: str | None = None
) -> str:
    """Presigned PUT op het publieke endpoint, zodat de browser direct kan uploaden."""
    client = _client(settings().s3_endpoint_publiek)
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": bucket or settings().s3_bucket_originals,
            "Key": object_key,
            "ContentType": content_type,
        },
        ExpiresIn=verloop_seconden,
    )


def presigned_get(object_key: str, verloop_seconden: int = 3600, bucket: str | None = None) -> str:
    client = _client(settings().s3_endpoint_publiek)
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket or settings().s3_bucket_originals, "Key": object_key},
        ExpiresIn=verloop_seconden,
    )


def bestaat(object_key: str) -> bool:
    try:
        intern().head_object(Bucket=settings().s3_bucket_originals, Key=object_key)
        return True
    except intern().exceptions.ClientError:
        return False
