import React, { useState, useRef } from 'react';
import { FileUp, FileText, Download, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { API_URL } from './config';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
      setSuccess(false);
      setDownloadUrl(null);
    } else if (selectedFile) {
      setError('Please select a valid PDF file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setError(null);
      setSuccess(false);
      setDownloadUrl(null);
    } else if (droppedFile) {
      setError('Please drop a valid PDF file.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const convertFile = async () => {
    if (!file) return;

    setIsConverting(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      // const response = await fetch('/api/convert', {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Conversion failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const name = file.name.replace(/\.pdf$/i, '.docx');
      
      setDownloadUrl(url);
      setFileName(name);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred during conversion.');
    } finally {
      setIsConverting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setSuccess(false);
    setDownloadUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900 font-sans selection:bg-indigo-100">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-24">
        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white mb-6 shadow-lg shadow-indigo-200"
          >
            <FileText size={32} />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-bold tracking-tight mb-3"
          >
            PDF to DOCX
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-500 text-lg"
          >
            Convert your PDF documents to editable Word files.
            <br />
            Supports English and Vietnamese text.
          </motion.p>
        </header>

        <main>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
          >
            {!file ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="p-12 md:p-20 border-2 border-dashed border-slate-200 m-4 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf"
                  className="hidden"
                />
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                  <FileUp size={28} className="text-slate-400 group-hover:text-indigo-600" />
                </div>
                <p className="text-lg font-medium mb-1">Click or drag PDF here</p>
                <p className="text-slate-400 text-sm">Maximum file size: 10MB</p>
              </div>
            ) : (
              <div className="p-8">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-red-50 text-red-500 flex items-center justify-center">
                      <FileText size={24} />
                    </div>
                    <div>
                      <p className="font-medium truncate max-w-[200px] md:max-w-md">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button 
                    onClick={reset}
                    disabled={isConverting}
                    className="p-2 hover:bg-slate-200 rounded-full transition-colors disabled:opacity-50"
                  >
                    <X size={20} className="text-slate-500" />
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {!success && !error && (
                    <button
                      onClick={convertFile}
                      disabled={isConverting}
                      className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:bg-indigo-400 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                    >
                      {isConverting ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          Converting...
                        </>
                      ) : (
                        <>
                          Convert to DOCX
                        </>
                      )}
                    </button>
                  )}

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-4 bg-red-50 text-red-600 rounded-xl flex items-start gap-3 border border-red-100"
                      >
                        <AlertCircle size={20} className="shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-semibold">Conversion Error</p>
                          <p>{error}</p>
                          <button 
                            onClick={convertFile}
                            className="mt-2 text-xs font-bold uppercase tracking-wider hover:underline"
                          >
                            Try Again
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {success && downloadUrl && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex flex-col gap-4"
                      >
                        <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl flex items-start gap-3 border border-emerald-100">
                          <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-semibold">Success!</p>
                            <p>Your document is ready for download.</p>
                          </div>
                        </div>
                        
                        <a
                          href={downloadUrl}
                          download={fileName}
                          className="w-full py-4 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                        >
                          <Download size={20} />
                          Download .docx
                        </a>

                        <button
                          onClick={reset}
                          className="w-full py-3 text-slate-500 font-medium hover:text-slate-800 transition-colors text-sm"
                        >
                          Convert another file
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        </main>

        <footer className="mt-12 text-center text-slate-400 text-sm">
          <p>© {new Date().getFullYear()} PDF to DOCX Converter. Secure & Private.</p>
          <p className="mt-1">Files are processed in-memory and never stored.</p>
        </footer>
      </div>
    </div>
  );
}
