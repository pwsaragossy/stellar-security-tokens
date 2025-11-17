import * as React from "react"
import { Upload, X, File } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

export interface FileUploadProps {
  accept?: string;
  maxSize?: number; // in bytes
  multiple?: boolean;
  onUpload: (files: File[]) => Promise<void>;
  label?: string;
  error?: string;
  uploadedFiles?: Array<{ name: string; hash?: string; url?: string }>;
  onRemove?: (index: number) => void;
}

export function FileUpload({
  accept = ".pdf,.doc,.docx",
  maxSize = 10 * 1024 * 1024, // 10MB
  multiple = false,
  onUpload,
  label,
  error,
  uploadedFiles = [],
  onRemove,
}: FileUploadProps) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    // Validate file size
    const invalidFiles = selectedFiles.filter(
      (file) => file.size > maxSize
    );
    
    if (invalidFiles.length > 0) {
      alert(`Alguns arquivos excedem o tamanho máximo de ${maxSize / 1024 / 1024}MB`);
      return;
    }

    setFiles((prev) => (multiple ? [...prev, ...selectedFiles] : selectedFiles));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    try {
      await onUpload(files);
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium mb-2 text-foreground">
          {label}
        </label>
      )}
      
      <div className="space-y-4">
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
            error
              ? "border-destructive bg-destructive/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <span className="text-sm font-medium text-primary">
                Clique para fazer upload
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {accept} (máx. {maxSize / 1024 / 1024}MB)
              </p>
            </div>
          </label>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 border rounded-md"
              >
                <div className="flex items-center gap-2">
                  <File className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(file.size / 1024).toFixed(2)} KB)
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                  className="h-6 w-6"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? "Enviando..." : "Enviar Arquivos"}
            </Button>
          </div>
        )}

        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Arquivos Enviados:</p>
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 border rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <File className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{file.name}</span>
                  {file.hash && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {file.hash.slice(0, 8)}...
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {file.url && (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Ver
                    </a>
                  )}
                  {onRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(index)}
                      className="h-6 w-6"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}

