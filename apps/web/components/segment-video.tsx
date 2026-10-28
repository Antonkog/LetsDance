"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type SegmentVideoHandle = {
  start: () => Promise<number>;
  pause: () => void;
};

export const SegmentVideo = forwardRef<SegmentVideoHandle, {
  src: string;
  startMs: number;
  endMs: number;
  speed: number;
  playing: boolean;
  looping: boolean;
  className?: string;
}>(function SegmentVideo({ src, startMs, endMs, speed, playing, looping, className }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const start = async () => {
    const video = videoRef.current;
    if (!video) return performance.now();
    video.currentTime = startMs / 1000;
    video.playbackRate = speed;
    await video.play();
    return performance.now();
  };

  useImperativeHandle(ref, () => ({
    start,
    pause: () => videoRef.current?.pause(),
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    if (video.currentTime < startMs / 1000 || video.currentTime >= endMs / 1000) {
      video.currentTime = startMs / 1000;
    }
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [startMs, endMs, speed, playing]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      className={className}
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (video.currentTime >= endMs / 1000) {
          if (looping) {
            video.currentTime = startMs / 1000;
            if (playing) void video.play().catch(() => undefined);
          } else video.pause();
        }
      }}
    />
  );
});
