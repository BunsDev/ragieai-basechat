import assert from "assert";

import { format } from "date-fns";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import Markdown from "react-markdown";

import { SourceMetadata } from "@/components/chatbot/types";
import { Skeleton } from "@/components/ui/skeleton";
import CONNECTOR_MAP from "@/lib/connector-map";
import { AUDIO_FILE_TYPES, VIDEO_FILE_TYPES } from "@/lib/file-utils";
import { getRagieStreamPath } from "@/lib/paths";
import { cn } from "@/lib/utils";
import CloseIcon from "@/public/icons/close.svg";
import ExternalLinkIcon from "@/public/icons/external-link.svg";
import Forward10Icon from "@/public/icons/forward_10.svg";
import FullScreenIcon from "@/public/icons/full_screen.svg";
import PauseIcon from "@/public/icons/pause.svg";
import PlayIcon from "@/public/icons/play.svg";
import Replay10Icon from "@/public/icons/replay_10.svg";
import VolumeUpIcon from "@/public/icons/volume_up.svg";

import { DocumentResponse } from "./types";
interface PlayerControlsProps {
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  onProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onPlayPause: () => void;
  onMute: () => void;
  onForward: () => void;
  onReplay: () => void;
  onFullscreen: () => void;
}

function PlayerControls({
  isPlaying,
  isMuted,
  currentTime,
  duration,
  onProgressClick,
  onPlayPause,
  onMute,
  onForward,
  onReplay,
  onFullscreen,
}: PlayerControlsProps) {
  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col">
      <div className="mt-2 px-2">
        <div className="h-1 bg-gray-200 rounded-full cursor-pointer relative" onClick={onProgressClick}>
          <div className="h-full bg-[#7749F8] rounded-full" style={{ width: `${(currentTime / duration) * 100}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-black rounded-sm"
            style={{ left: `${(currentTime / duration) * 100}%`, transform: "translate(-50%, -50%)" }}
          />
        </div>
        <div className="flex justify-between text-sm text-gray-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 mt-4">
        <button onClick={onMute} className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200">
          <Image
            src={VolumeUpIcon}
            alt={isMuted ? "Unmute" : "Mute"}
            width={32}
            height={32}
            className={cn(isMuted && "opacity-50")}
          />
        </button>
        <div className="flex items-center gap-0">
          <button onClick={onReplay} className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200">
            <Image src={Replay10Icon} alt="Replay 10 seconds" width={32} height={32} />
          </button>
          <button onClick={onPlayPause} className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200">
            <Image src={isPlaying ? PauseIcon : PlayIcon} alt={isPlaying ? "Pause" : "Play"} width={48} height={48} />
          </button>
          <button onClick={onForward} className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200">
            <Image src={Forward10Icon} alt="Forward 10 seconds" width={32} height={32} />
          </button>
        </div>
        <button onClick={onFullscreen} className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200">
          <Image src={FullScreenIcon} alt={"Toggle fullscreen"} width={32} height={32} />
        </button>
      </div>
    </div>
  );
}

interface Props {
  className?: string;
  source: SourceMetadata;
  slug: string;
  onCloseClick: () => void;
}

export default function Summary({ className, source, slug, onCloseClick = () => {} }: Props) {
  const [documentData, setDocumentData] = useState<DocumentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setIsMediaLoaded(false);
    setDocumentData(null);

    (async () => {
      try {
        const res = await fetch(`/api/documents/${source.documentId}`, {
          headers: { tenant: slug },
        });

        if (!res.ok) {
          setDocumentData({
            name: "Document",
            metadata: {
              source_type: "unknown",
              source_url: "#",
            },
            updatedAt: new Date().toISOString(),
            summary: "Document summary not available",
          });
          throw new Error("could not retrieve document with summary");
        }

        const json = (await res.json()) as DocumentResponse;
        setDocumentData(json);
      } catch (error) {
        console.error("Error fetching document:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [source.documentId, slug]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const media = videoRef.current || audioRef.current;
    if (media && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      const newTime = pos * duration;
      console.log("Seeking to:", newTime, "duration:", duration);
      media.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const icon =
    documentData?.metadata.source_type && CONNECTOR_MAP[documentData.metadata.source_type]
      ? CONNECTOR_MAP[documentData.metadata.source_type][1]
      : null;

  const isVideo =
    source.documentName?.toLowerCase() &&
    VIDEO_FILE_TYPES.some((ext) => source.documentName?.toLowerCase().endsWith(ext));
  const isAudio =
    source.documentName?.toLowerCase() &&
    AUDIO_FILE_TYPES.some((ext) => source.documentName?.toLowerCase().endsWith(ext));

  if (isLoading || !documentData) {
    return (
      <div className={cn(className, "relative")}>
        <div className="absolute top-4 right-4">
          <Image className="cursor-pointer" src={CloseIcon} alt="Close" onClick={onCloseClick} />
        </div>
        <div className="flex flex-col justify-center items-center h-full w-full">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <div key={n} className="w-full flex flex-col">
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-[85%] mb-7" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(className, "relative")}>
      <div className="absolute top-4 right-4">
        <Image className="cursor-pointer" src={CloseIcon} alt="Close" onClick={onCloseClick} />
      </div>
      {icon && <Image src={icon} alt="source" width={48} />}
      <div className="wrap text-[24px] font-bold mb-4 break-all">{documentData.name}</div>
      <div className="flex justify-between mb-6">
        <div className="text-[#74747A]">Updated {format(documentData.updatedAt, "MM/dd/yyyy")}</div>
        {!source.streamUrl && (
          <a href={documentData.metadata.source_url} target="_blank" className="text-[#7749F8] flex">
            View in source
            <Image src={ExternalLinkIcon} alt="Open in new window" />
          </a>
        )}
      </div>
      <hr className="mb-6" />
      {source.streamUrl && (
        <div className="mb-6">
          {(() => {
            if (isAudio) {
              console.log("Audio player state:", {
                isMediaLoaded,
                duration,
                currentTime,
                isPlaying,
                readyState: audioRef.current?.readyState,
              });

              return (
                <div className="flex flex-col">
                  <audio
                    ref={audioRef}
                    className="w-full"
                    src={getRagieStreamPath(slug, source.streamUrl)}
                    controls={false}
                    preload="metadata"
                    onLoadedMetadata={() => {
                      assert(audioRef.current, "audioRef not loaded");
                      console.log("Audio metadata loaded (inline), duration:", audioRef.current.duration);
                      setDuration(audioRef.current.duration);
                      setIsMediaLoaded(true);
                    }}
                    onLoadedData={() => {
                      assert(audioRef.current, "audioRef not loaded");
                      console.log("Audio data loaded (inline), duration:", audioRef.current.duration);
                      setDuration(audioRef.current.duration);
                      setIsMediaLoaded(true);
                    }}
                    onDurationChange={() => {
                      assert(audioRef.current, "audioRef not loaded");
                      console.log("Audio duration changed (inline):", audioRef.current.duration);
                      setDuration(audioRef.current.duration);
                      setIsMediaLoaded(true);
                    }}
                    onTimeUpdate={() => {
                      assert(audioRef.current, "audioRef not loaded");
                      console.log("Audio time update (inline):", audioRef.current.currentTime);
                      setCurrentTime(audioRef.current.currentTime);
                    }}
                  />
                  {isMediaLoaded && (
                    <PlayerControls
                      isPlaying={isPlaying}
                      isMuted={isMuted}
                      currentTime={currentTime}
                      duration={duration}
                      onProgressClick={handleProgressClick}
                      onPlayPause={() => {
                        assert(audioRef.current, "audioRef not loaded");
                        if (audioRef.current.paused) {
                          audioRef.current.play();
                          setIsPlaying(true);
                        } else {
                          audioRef.current.pause();
                          setIsPlaying(false);
                        }
                      }}
                      onMute={() => {
                        assert(audioRef.current, "audioRef not loaded");
                        audioRef.current.muted = !audioRef.current.muted;
                        setIsMuted(!isMuted);
                      }}
                      onForward={() => {
                        assert(audioRef.current, "audioRef not loaded");
                        const newTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 10);
                        audioRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                      }}
                      onReplay={() => {
                        assert(audioRef.current, "audioRef not loaded");
                        const newTime = Math.max(0, audioRef.current.currentTime - 10);
                        audioRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                      }}
                      onFullscreen={() => {}}
                    />
                  )}
                </div>
              );
            }

            if (isVideo) {
              return (
                <div className="flex flex-col">
                  <video
                    ref={videoRef}
                    className="w-full rounded-lg"
                    src={getRagieStreamPath(slug, source.streamUrl)}
                    controls={false}
                    onLoadedMetadata={() => {
                      assert(videoRef.current, "videoRef not loaded");
                      console.log("Video metadata loaded (inline), duration:", videoRef.current.duration);
                      setDuration(videoRef.current.duration);
                      setIsMediaLoaded(true);
                    }}
                    onLoadedData={() => {
                      assert(videoRef.current, "videoRef not loaded");
                      console.log("Video data loaded (inline), duration:", videoRef.current.duration);
                      setDuration(videoRef.current.duration);
                      setIsMediaLoaded(true);
                    }}
                    onTimeUpdate={() => {
                      assert(videoRef.current, "videoRef not loaded");
                      console.log("Video time update (inline):", videoRef.current.currentTime);
                      setCurrentTime(videoRef.current.currentTime);
                    }}
                  />
                  {isMediaLoaded && duration > 0 && (
                    <PlayerControls
                      isPlaying={isPlaying}
                      isMuted={isMuted}
                      currentTime={currentTime}
                      duration={duration}
                      onProgressClick={handleProgressClick}
                      onPlayPause={() => {
                        assert(videoRef.current, "videoRef not loaded");
                        if (videoRef.current.paused) {
                          videoRef.current.play();
                          setIsPlaying(true);
                        } else {
                          videoRef.current.pause();
                          setIsPlaying(false);
                        }
                      }}
                      onMute={() => {
                        assert(videoRef.current, "videoRef not loaded");
                        videoRef.current.muted = !videoRef.current.muted;
                        setIsMuted(!isMuted);
                      }}
                      onForward={() => {
                        assert(videoRef.current, "videoRef not loaded");
                        const newTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
                        videoRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                      }}
                      onReplay={() => {
                        assert(videoRef.current, "videoRef not loaded");
                        const newTime = Math.max(0, videoRef.current.currentTime - 10);
                        videoRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                      }}
                      onFullscreen={() => {
                        assert(videoRef.current, "videoRef not loaded");
                        if (document.fullscreenElement) {
                          document.exitFullscreen();
                        } else {
                          videoRef.current.requestFullscreen();
                        }
                      }}
                    />
                  )}
                </div>
              );
            }

            return null;
          })()}
          {source.downloadUrl && (
            <a
              href={getRagieStreamPath(slug, source.downloadUrl)}
              download
              target="_blank"
              className="text-[#7749F8] flex items-center mt-2"
            >
              Download {isVideo ? "video" : "audio"}
              <Image src={ExternalLinkIcon} alt="Download" className="ml-1" />
            </a>
          )}
        </div>
      )}
      <div className="text-[12px] font-bold mb-4">Summary</div>
      <Markdown className="markdown">{documentData.summary}</Markdown>
    </div>
  );
}
