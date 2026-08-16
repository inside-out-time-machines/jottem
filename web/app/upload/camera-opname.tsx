"use client";

import { useEffect, useRef } from "react";

// Echte camera-opname via getUserMedia (werkt op telefoon én desktop-webcam);
// de capture-hint op een file-input wordt door desktopbrowsers genegeerd.
export default function CameraOpname({
  onFoto,
  onSluit,
}: {
  onFoto: (bestand: File) => void;
  onSluit: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dialoogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialoogRef.current?.showModal();
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => onSluit());
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function maakFoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onFoto(new File([blob], "camera-foto.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <dialog ref={dialoogRef} className="dialoog" onClose={onSluit}>
      <h2>Maak een foto</h2>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: ".35rem", background: "var(--inkt)" }} />
      <div className="dialoog-knoppen">
        <button type="button" className="knop knop-primair" onClick={maakFoto}>
          📷 Maak de foto
        </button>
        <button type="button" className="knop knop-secundair" onClick={() => dialoogRef.current?.close()}>
          Annuleren
        </button>
      </div>
    </dialog>
  );
}
