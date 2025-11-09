import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileUploadButtonProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

const VALID_CAD_EXTENSIONS = ['.stl', '.scad'];
const VALID_MIME_TYPES = [
  'model/stl',
  'application/sla',
  'application/vnd.ms-pki.stl',
  'application/x-openscad',
  'text/plain',
  'application/octet-stream',
];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export default function FileUploadButton({
  onFileSelect,
  disabled = false,
  className = '',
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`;
    }

    // Check file extension
    const fileName = file.name.toLowerCase();
    const hasValidExtension = VALID_CAD_EXTENSIONS.some(ext =>
      fileName.endsWith(ext)
    );

    if (!hasValidExtension) {
      return `Please upload a .stl or .scad file`;
    }

    // Check MIME type (if available)
    if (file.type && !VALID_MIME_TYPES.includes(file.type)) {
      // Some systems don't set MIME type correctly for STL/SCAD files
      // So we only warn if a type is set and it's not in our list
      console.warn(`Unexpected MIME type: ${file.type}, but extension is valid`);
    }

    return null;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      // Clear the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    onFileSelect(file);

    // Clear the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl,.scad"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg
          bg-white/10 hover:bg-white/20
          border border-white/20
          text-white/90 hover:text-white
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
        title="Upload STL or SCAD file"
      >
        <Upload className="w-4 h-4" />
        <span className="text-sm font-medium">Upload Design</span>
      </button>
      {error && (
        <div className="absolute top-full mt-2 left-0 right-0 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
