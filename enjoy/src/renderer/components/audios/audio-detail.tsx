import { useEffect, useState, useContext } from "react";
import {
  DbProviderContext,
  AppSettingsProviderContext,
  AISettingsProviderContext,
} from "@renderer/context";
import {
  LoaderSpin,
  RecordingsList,
  PagePlaceholder,
  MediaPlayer,
  MediaTranscription,
} from "@renderer/components";
import { CheckCircleIcon, LoaderIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogCancel,
  Button,
  PingPoint,
  Progress,
  ScrollArea,
  toast,
} from "@renderer/components/ui";
import { t } from "i18next";
import { useTranscribe } from "@renderer/hooks";
import { useNavigate } from "react-router-dom";

export const AudioDetail = (props: { id?: string; md5?: string }) => {
  const navigate = useNavigate();

  const { id, md5 } = props;
  const { addDblistener, removeDbListener } = useContext(DbProviderContext);
  const { whisperConfig } = useContext(AISettingsProviderContext);
  const { EnjoyApp, webApi } = useContext(AppSettingsProviderContext);

  const [audio, setAudio] = useState<AudioType | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionType>(null);
  const [sharing, setSharing] = useState<boolean>(false);

  // Transcription controls
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const { transcribe } = useTranscribe();
  const [transcribingProgress, setTranscribingProgress] = useState<number>(0);

  // Player controls
  const [initialized, setInitialized] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [seek, setSeek] = useState<{
    seekTo: number;
    timestamp: number;
  }>();
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(0);
  const [zoomRatio, setZoomRatio] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<"loop" | "single" | "all">("all");
  const [playBackRate, setPlaybackRate] = useState<number>(1);
  const [displayInlineCaption, setDisplayInlineCaption] =
    useState<boolean>(true);

  const onTransactionUpdate = (event: CustomEvent) => {
    const { model, action, record } = event.detail || {};
    if (model === "Transcription" && action === "update") {
      setTranscription(record);
    }
  };

  const generateTranscription = async () => {
    if (transcribing) return;

    setTranscribing(true);
    setTranscribingProgress(0);
    try {
      const { engine, model, result } = await transcribe(audio.src);
      await EnjoyApp.transcriptions.update(transcription.id, {
        state: "finished",
        result,
        engine,
        model,
      });
    } catch (err) {
      toast.error(err.message);
    }

    setTranscribing(false);
  };

  const findTranscriptionFromWebApi = async () => {
    const res = await webApi.transcriptions({
      targetMd5: audio.md5,
    });

    const transcript = (res?.transcriptions || []).filter((t) =>
      ["base", "small", "medium", "large", "whisper-1"].includes(t.model)
    )?.[0];

    if (!transcript) {
      throw new Error("Transcription not found");
    }

    await EnjoyApp.transcriptions.update(transcription.id, {
      state: "finished",
      result: transcript.result,
      engine: transcript.engine,
      model: transcript.model,
    });
  };

  const findOrGenerateTranscription = async () => {
    try {
      await findTranscriptionFromWebApi();
    } catch (err) {
      console.error(err);
      await generateTranscription();
    }
  };

  const handleShare = async () => {
    if (!audio.source && !audio.isUploaded) {
      try {
        await EnjoyApp.audios.upload(audio.id);
      } catch (err) {
        toast.error(t("shareFailed"), {
          description: err.message,
        });
        return;
      }
    }
    webApi
      .createPost({
        targetType: "Audio",
        targetId: audio.id,
      })
      .then(() => {
        toast.success(t("sharedSuccessfully"), {
          description: t("sharedAudio"),
        });
      })
      .catch((err) => {
        toast.error(t("shareFailed"), {
          description: err.message,
        });
      });
    setSharing(false);
  };

  useEffect(() => {
    const where = id ? { id } : { md5 };
    EnjoyApp.audios.findOne(where).then((audio) => {
      if (audio) {
        setAudio(audio);
      } else {
        toast.error(t("models.audio.notFound"));
      }
    });
  }, [id, md5]);

  useEffect(() => {
    if (!audio) return;

    EnjoyApp.transcriptions
      .findOrCreate({
        targetId: audio.id,
        targetType: "Audio",
      })
      .then((transcription) => {
        setTranscription(transcription);
      });
  }, [audio]);

  useEffect(() => {
    if (!initialized) return;
    if (!transcription) return;

    addDblistener(onTransactionUpdate);

    if (transcription?.state == "pending") {
      findOrGenerateTranscription();
    }

    if (whisperConfig.service === "local") {
      EnjoyApp.whisper.onProgress((_, p: number) => {
        if (p > 100) p = 100;
        setTranscribingProgress(p);
      });
    }

    return () => {
      removeDbListener(onTransactionUpdate);
      EnjoyApp.whisper.removeProgressListeners();
    };
  }, [md5, transcription, initialized]);

  if (!audio) {
    return <LoaderSpin />;
  }

  if (!audio.src) {
    return (
      <PagePlaceholder placeholder="invalid" extra="cannot find play source" />
    );
  }

  return (
    <div className="relative">
      <div className={`grid grid-cols-7 gap-4 ${initialized ? "" : "blur-sm"}`}>
        <div className="col-span-5 h-[calc(100vh-6.5rem)] flex flex-col">
          <MediaPlayer
            mediaId={audio.id}
            mediaType="Audio"
            mediaUrl={audio.src}
            mediaMd5={audio.md5}
            transcription={transcription}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            currentSegmentIndex={currentSegmentIndex}
            setCurrentSegmentIndex={setCurrentSegmentIndex}
            recordButtonVisible={true}
            seek={seek}
            initialized={initialized}
            setInitialized={setInitialized}
            zoomRatio={zoomRatio}
            setZoomRatio={setZoomRatio}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            playMode={playMode}
            setPlayMode={setPlayMode}
            playBackRate={playBackRate}
            setPlaybackRate={setPlaybackRate}
            displayInlineCaption={displayInlineCaption}
            setDisplayInlineCaption={setDisplayInlineCaption}
            onShare={() => setSharing(true)}
            onDecoded={({ duration, sampleRate }) => {
              if (audio.duration) return;

              EnjoyApp.audios.update(audio.id, {
                metadata: Object.assign({}, audio.metadata, {
                  duration,
                  sampleRate,
                }),
              });
            }}
          />

          <ScrollArea className={`flex-1 relative bg-muted`}>
            <RecordingsList
              key={`recordings-list-${audio.id}-${currentSegmentIndex}`}
              targetId={audio.id}
              targetType="Audio"
              referenceText={transcription?.result?.[currentSegmentIndex]?.text}
              referenceId={currentSegmentIndex}
            />
          </ScrollArea>
        </div>

        <div className="col-span-2 h-[calc(100vh-6.5rem)]">
          <MediaTranscription
            mediaId={audio.id}
            mediaType="Audio"
            mediaName={audio.name}
            transcription={transcription}
            transcribing={transcribing}
            progress={transcribingProgress}
            transcribe={generateTranscription}
            currentSegmentIndex={currentSegmentIndex}
            onSelectSegment={(index) => {
              if (currentSegmentIndex === index) return;

              const segment = transcription?.result?.[index];
              if (!segment) return;

              if (playMode === "loop" && isPlaying) setIsPlaying(false);
              setSeek({
                seekTo: segment.offsets.from / 1000,
                timestamp: Date.now(),
              });
            }}
          />
        </div>
      </div>

      <AlertDialog open={sharing} onOpenChange={(value) => setSharing(value)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("shareAudio")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("areYouSureToShareThisAudioToCommunity")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <Button variant="default" onClick={handleShare}>
              {t("share")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Show loading progress until waveform is decoded & transcribed */}
      <AlertDialog open={!initialized || !Boolean(transcription?.result)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("preparingAudio")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("itMayTakeAWhileToPrepareForTheFirstLoad")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            {initialized ? (
              <div className="mb-4 flex items-center space-x-4">
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                <span>{t("waveformIsDecoded")}</span>
              </div>
            ) : (
              <div className="mb-4 flex items-center space-x-4">
                <LoaderIcon className="w-4 h-4 animate-spin" />
                <span>{t("decodingWaveform")}</span>
              </div>
            )}

            {!transcription ? (
              <div className="flex items-center space-x-4">
                <LoaderIcon className="w-4 h-4 animate-spin" />
                <span>{t("loadingTranscription")}</span>
              </div>
            ) : transcription.result ? (
              <div className="flex items-center space-x-4">
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                <span>{t("transcribedSuccessfully")}</span>
              </div>
            ) : transcribing ? (
              <div className="">
                <div className="flex items-center space-x-4 mb-2">
                  <PingPoint colorClassName="bg-yellow-500" />
                  <span>{t("transcribing")}</span>
                </div>
                {whisperConfig.service === "local" && (
                  <Progress value={transcribingProgress} />
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <PingPoint colorClassName="bg-muted" />
                <div className="inline">
                  <span>{t("notTranscribedYet")}</span>
                  {initialized && (
                    <Button
                      onClick={generateTranscription}
                      className="ml-4"
                      size="sm"
                    >
                      {t("transcribe")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              {t("cancel")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
