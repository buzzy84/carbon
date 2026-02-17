import { useCarbon } from "@carbon/auth";
import {
  CardHeader,
  CardTitle,
  ClientOnly,
  cn,
  ModelViewer,
  Spinner,
  toast
} from "@carbon/react";
import { useMode } from "@carbon/remix";
import {
  convertKbToString,
  getFileSizeLimit,
  supportedModelTypes
} from "@carbon/utils";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { LuCloudUpload } from "react-icons/lu";
import { useFetcher } from "react-router";
import { useUser } from "~/hooks";
import { getPrivateUrl, path } from "~/utils/path";

const SIZE_LIMIT = getFileSizeLimit("CAD_MODEL_UPLOAD");

type CadModelProps = {
  modelPath: string | null;
  metadata?: {
    itemId?: string;
    salesRfqLineId?: string;
    purchasingRfqLineId?: string;
    quoteLineId?: string;
    salesOrderLineId?: string;
    jobId?: string;
  };
  title?: string;
  uploadClassName?: string;
  viewerClassName?: string;
  isReadOnly?: boolean;
};

const CadModel = ({
  isReadOnly,
  metadata,
  modelPath,
  title,
  uploadClassName,
  viewerClassName
}: CadModelProps) => {
  const {
    company: { id: companyId }
  } = useUser();
  const mode = useMode();
  const { carbon } = useCarbon();

  const fetcher = useFetcher<{}>();
  const [file, setFile] = useState<File | null>(null);

  // Local preview (immediate) for WebHTML
  const [localHtmlUrl, setLocalHtmlUrl] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const effectiveFileName = useMemo(() => {
    return file?.name ?? modelPath?.split("/").pop() ?? "";
  }, [file?.name, modelPath]);

  const fileExtension = useMemo(() => {
    return effectiveFileName.split(".").pop()?.toLowerCase() ?? null;
  }, [effectiveFileName]);

  const isEdrawingsWebHtml = fileExtension === "html" || fileExtension === "htm";

  const forceIframeResize = () => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    try {
      w.dispatchEvent(new Event("resize"));
      setTimeout(() => w.dispatchEvent(new Event("resize")), 150);
      setTimeout(() => w.dispatchEvent(new Event("resize")), 400);
      setTimeout(() => w.dispatchEvent(new Event("resize")), 800);
    } catch {
      // ignore
    }
  };

  // Create object URL for local HTML preview
  useEffect(() => {
    if (!file || !isEdrawingsWebHtml) {
      setLocalHtmlUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalHtmlUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isEdrawingsWebHtml]);

  async function patchEdrawingsWebHtml(incoming: File): Promise<File> {
    const ext = incoming.name.split(".").pop()?.toLowerCase();
    if (ext !== "html" && ext !== "htm") return incoming;

    const original = await incoming.text();

    // Avoid double injection
    if (
      original.includes('id="carbon-edrawings-fix"') ||
      original.includes('id="carbon-edrawings-resize"')
    ) {
      return incoming;
    }

    // IMPORTANT: inject at END of <head> so it wins against the exporter CSS.
    const overrideCss = `<style id="carbon-edrawings-fix">
/* Force the page to be 100% of iframe */
html, body {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

/* Force the viewer root to fill */
#edrawings-viewer {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

/* Force common wrapper classes to fill (export varies by version) */
.edrawings-viewer-regular,
.edrawings-viewer-timeout,
.edrawings-viewer-ondrop,
.edrawings-viewer-dropsuccess,
.edrawings-viewer-dropfail {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
}

/* Canvas fill */
#edrawings-canvas,
canvas {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}
</style>`;

    const resizeScript = `<script id="carbon-edrawings-resize">
(function () {
  function fix() {
    try {
      document.documentElement.style.width = "100%";
      document.documentElement.style.height = "100%";
      document.body.style.width = "100%";
      document.body.style.height = "100%";

      var v = document.getElementById("edrawings-viewer");
      if (v) {
        v.style.position = "absolute";
        v.style.top = "0";
        v.style.left = "0";
        v.style.right = "0";
        v.style.bottom = "0";
        v.style.width = "100%";
        v.style.height = "100%";
      }

      var c = document.getElementById("edrawings-canvas");
      if (c) {
        c.style.position = "absolute";
        c.style.top = "0";
        c.style.left = "0";
        c.style.right = "0";
        c.style.bottom = "0";
        c.style.width = "100%";
        c.style.height = "100%";
      }

      window.dispatchEvent(new Event("resize"));
    } catch (e) {}
  }

  window.addEventListener("load", function () {
    fix();
    var i = 0;
    var t = setInterval(function () {
      fix();
      if (++i > 40) clearInterval(t); // ~8s
    }, 200);
  });

  window.addEventListener("resize", fix);
})();
</script>`;

    let patched = original;

    // Fix common exports that use inherit
    patched = patched
      .replace(/width:\s*inherit\s*;/gi, "width: 100% !important;")
      .replace(/height:\s*inherit\s*;/gi, "height: 100% !important;");

    if (/<\/head>/i.test(patched)) {
      patched = patched.replace(/<\/head>/i, `${overrideCss}\n${resizeScript}\n</head>`);
    } else if (/<head[^>]*>/i.test(patched)) {
      // fallback: append right after <head> if no </head> found
      patched = patched.replace(/<head[^>]*>/i, (m) => `${m}\n${overrideCss}\n${resizeScript}`);
    } else {
      patched = `${overrideCss}\n${resizeScript}\n${patched}`;
    }

    const blob = new Blob([patched], { type: "text/html;charset=utf-8" });
    return new File([blob], incoming.name, { type: "text/html" });
  }

  const onFileChange = async (incoming: File | null) => {
    const modelId = nanoid();
    setFile(incoming);

    if (!incoming) return;

    if (!carbon) {
      toast.error("Failed to initialize carbon client");
      return;
    }

    const ext = incoming.name.split(".").pop()?.toLowerCase();
    if (!ext) {
      toast.error("File senza estensione non supportato");
      return;
    }

    let fileToUpload = incoming;

    // Patch WebHTML eDrawings
    if (ext === "html" || ext === "htm") {
      try {
        fileToUpload = await patchEdrawingsWebHtml(incoming);
        setFile(fileToUpload); // local preview uses patched version
      } catch {
        fileToUpload = incoming;
      }
    }

    toast.info(`Uploading ${fileToUpload.name}`);

    const fileName = `${companyId}/models/${modelId}.${ext}`;

    const modelUpload = await carbon.storage
      .from("private")
      .upload(fileName, fileToUpload, {
        upsert: true,
        contentType: ext === "html" || ext === "htm" ? "text/html; charset=utf-8" : undefined
      });

    if (modelUpload.error || !modelUpload.data?.path) {
      toast.error("Failed to upload file to storage");
      return;
    }

    const formData = new FormData();
    formData.append("name", fileToUpload.name);
    formData.append("modelId", modelId);
    formData.append("modelPath", modelUpload.data.path);
    formData.append("size", fileToUpload.size.toString());

    if (metadata) {
      if (metadata.itemId) formData.append("itemId", metadata.itemId);
      if (metadata.salesRfqLineId) formData.append("salesRfqLineId", metadata.salesRfqLineId);
      if (metadata.quoteLineId) formData.append("quoteLineId", metadata.quoteLineId);
      if (metadata.salesOrderLineId) formData.append("salesOrderLineId", metadata.salesOrderLineId);
      if (metadata.jobId) formData.append("jobId", metadata.jobId);
    }

    fetcher.submit(formData, {
      method: "post",
      action: path.to.api.modelUpload
    });
  };

  const iframeSrc = useMemo(() => {
    if (localHtmlUrl) return localHtmlUrl;
    if (modelPath && isEdrawingsWebHtml) return getPrivateUrl(modelPath);
    return null;
  }, [localHtmlUrl, modelPath, isEdrawingsWebHtml]);

  return (
    <ClientOnly
      fallback={
        <div className="flex w-full h-full rounded bg-gradient-to-bl from-card from-50% via-card to-background dark:border-none dark:shadow-[inset_0_0.5px_0_rgb(255_255_255_/_0.08),_inset_0_0_1px_rgb(255_255_255_/_0.24),_0_0_0_0.5px_rgb(0,0,0,1),0px_0px_4px_rgba(0,_0,_0,_0.08)] items-center justify-center">
          <Spinner className="h-10 w-10" />
        </div>
      }
    >
      {() => {
        return file || modelPath ? (
          isEdrawingsWebHtml ? (
            // Mirror ModelViewer outer box so it occupies the same area
            <div
              className={cn(
                "h-full w-full items-center justify-center rounded-lg border border-border bg-gradient-to-bl from-card from-50% via-card to-background min-h-[400px] shadow-md dark:border-none dark:shadow-[inset_0_0.5px_0_rgb(255_255_255_/_0.08),_inset_0_0_1px_rgb(255_255_255_/_0.24),_0_0_0_0.5px_rgb(0,0,0,1),0px_0px_4px_rgba(0,_0,_0,_0.08)] relative",
                viewerClassName
              )}
            >
              {iframeSrc ? (
                <iframe
                  ref={iframeRef}
                  onLoad={forceIframeResize}
                  title="eDrawings WebHTML"
                  src={iframeSrc}
                  className="absolute inset-0 w-full h-full block"
                  sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  Anteprima non disponibile
                </div>
              )}
            </div>
          ) : (
            <ModelViewer
              key={modelPath}
              file={file}
              url={modelPath ? getPrivateUrl(modelPath) : null}
              mode={mode}
              className={viewerClassName}
            />
          )
        ) : (
          <CadModelUpload
            className={uploadClassName}
            file={file}
            title={title}
            isReadOnly={isReadOnly}
            onFileChange={onFileChange}
          />
        );
      }}
    </ClientOnly>
  );
};

export default CadModel;

type CadModelUploadProps = {
  title?: string;
  file: File | null;
  className?: string;
  isReadOnly?: boolean;
  onFileChange: (file: File | null) => void;
};

const CadModelUpload = ({
  title,
  file,
  isReadOnly,
  className,
  onFileChange
}: CadModelUploadProps) => {
  const hasFile = !!file;

  const allowedTypes = useMemo(() => {
    return Array.from(new Set([...supportedModelTypes, "html", "htm"]));
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    disabled: hasFile || !!isReadOnly,
    multiple: false,
    maxSize: SIZE_LIMIT.bytes,
    onDropAccepted: (acceptedFiles) => {
      const file = acceptedFiles[0];

      const fileExtension = file.name.split(".").pop()?.toLowerCase();
      if (!fileExtension || !allowedTypes.includes(fileExtension)) {
        toast.error("File type not supported");
        return;
      }

      if (file.size > SIZE_LIMIT.bytes) {
        toast.error(`File size too big (max. ${SIZE_LIMIT.format()})`);
        return;
      }

      onFileChange(file);
    },
    onDropRejected: (fileRejections) => {
      const { errors } = fileRejections[0];
      let message;
      if (errors[0].code === "file-too-large") {
        message = `File size too big (max. ${SIZE_LIMIT.format()})`;
      } else if (errors[0].code === "file-invalid-type") {
        message = "File type not supported";
      } else {
        message = errors[0].message;
      }
      toast.error(message);
    }
  });

  if (isReadOnly) {
    return null;
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "group flex flex-col flex-grow rounded-lg border border-border bg-gradient-to-bl from-card from-50% via-card to-background dark:border-none dark:shadow-[inset_0_0.5px_0_rgb(255_255_255_/_0.08),_inset_0_0_1px_rgb(255_255_255_/_0.24),_0_0_0_0.5px_rgb(0,0,0,1),0px_0px_4px_rgba(0,_0,_0,_0.08)] text-card-foreground shadow-sm w-full min-h-[400px] ",
        !hasFile &&
          "cursor-pointer hover:border-primary/30 hover:border-dashed hover:to-primary/10 hover:via-card border-2 border-dashed",
        className
      )}
    >
      <input {...getInputProps()} name="file" className="sr-only" />
      <div className="flex flex-col h-full w-full p-4">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>

        <div className="flex flex-col flex-grow items-center justify-center gap-2 p-6">
          {file && <Spinner className={cn("h-16 w-16", title && "-mt-16")} />}
          {file && (
            <>
              <p className="text-lg text-card-foreground mt-8">{file.name}</p>
              <p className="text-muted-foreground group-hover:text-foreground">
                {convertKbToString(Math.ceil(file.size / 1024))}
              </p>
            </>
          )}
          {!file && (
            <>
              <div
                className={cn(
                  "p-4 bg-accent rounded-full group-hover:bg-primary",
                  title ? "-mt-16" : "-mt-6"
                )}
              >
                <LuCloudUpload className="mx-auto h-12 w-12 text-muted-foreground group-hover:text-primary-foreground" />
              </div>
              <p className="text-base text-muted-foreground group-hover:text-foreground mt-8">
                Choose file to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground group-hover:text-foreground">
                Supports {allowedTypes.join(", ")} files
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
