"use client"

import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  List, 
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
  Link as LinkIcon,
  Undo,
  Redo,
  FileText,
  X,
  Upload as UploadIcon
} from 'lucide-react'
import { announcementService } from '@/services/announcement'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [showFileUploadModal, setShowFileUploadModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] px-4 py-3 text-gray-900',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const currentHtml = editor.getHTML()
    if (value !== currentHtml) {
      editor.commands.setContent(value || '')
    }
  }, [editor, value])

  if (!editor) {
    return null
  }

  const addImage = () => {
    const url = window.prompt('Resim URL\'si girin:')
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  const addImageFromFile = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result as string
          if (base64) {
            editor.chain().focus().setImage({ src: base64 }).run()
          }
        }
        reader.onerror = () => {
          console.error('Failed to read file for editor image upload')
          alert('Resim işlenirken bir hata oluştu')
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  const addLink = () => {
    const url = window.prompt('Link URL\'si girin:')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const openFileUploadModal = () => {
    setShowFileUploadModal(true)
    setSelectedFile(null)
    setFileName('')
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setFileName(file.name)
    }
  }

  const uploadFileAndInsertLink = async () => {
    if (!selectedFile || !fileName.trim()) {
      alert('Lütfen dosya ve dosya adını girin')
      return
    }

    setUploading(true)
    try {
      const fileUrl = await announcementService.uploadFile(selectedFile)
      
      editor.chain().focus().insertContent(`<a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">${fileName}</a>`).run()
      
      setShowFileUploadModal(false)
      setSelectedFile(null)
      setFileName('')
    } catch (error) {
      console.error('File upload error:', error)
      alert('Dosya yüklenirken bir hata oluştu')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-1 p-2 border-b border-gray-300 bg-gray-50">
          {/* Text Formatting */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('bold') ? 'bg-gray-300' : ''
            }`}
            title="Kalın (Bold)"
          >
            <Bold className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('italic') ? 'bg-gray-300' : ''
            }`}
            title="İtalik"
          >
            <Italic className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('underline') ? 'bg-gray-300' : ''
            }`}
            title="Altı Çizgili"
          >
            <UnderlineIcon className="h-4 w-4 text-gray-700" />
          </button>

          <div className="w-px h-8 bg-gray-300 mx-1"></div>

          {/* Headings */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('heading', { level: 1 }) ? 'bg-gray-300' : ''
            }`}
            title="Başlık 1"
          >
            <Heading1 className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('heading', { level: 2 }) ? 'bg-gray-300' : ''
            }`}
            title="Başlık 2"
          >
            <Heading2 className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('heading', { level: 3 }) ? 'bg-gray-300' : ''
            }`}
            title="Başlık 3"
          >
            <Heading3 className="h-4 w-4 text-gray-700" />
          </button>

          <div className="w-px h-8 bg-gray-300 mx-1"></div>

          {/* Lists */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('bulletList') ? 'bg-gray-300' : ''
            }`}
            title="Madde İşaretli Liste"
          >
            <List className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('orderedList') ? 'bg-gray-300' : ''
            }`}
            title="Numaralı Liste"
          >
            <ListOrdered className="h-4 w-4 text-gray-700" />
          </button>

          <div className="w-px h-8 bg-gray-300 mx-1"></div>

          {/* Text Align */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive({ textAlign: 'left' }) ? 'bg-gray-300' : ''
            }`}
            title="Sola Hizala"
          >
            <AlignLeft className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive({ textAlign: 'center' }) ? 'bg-gray-300' : ''
            }`}
            title="Ortala"
          >
            <AlignCenter className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive({ textAlign: 'right' }) ? 'bg-gray-300' : ''
            }`}
            title="Sağa Hizala"
          >
            <AlignRight className="h-4 w-4 text-gray-700" />
          </button>

          <div className="w-px h-8 bg-gray-300 mx-1"></div>

          {/* Media */}
          <button
            type="button"
            onClick={addImageFromFile}
            className="p-2 rounded hover:bg-gray-200 transition-colors"
            title="Resim Yükle"
          >
            <ImageIcon className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={openFileUploadModal}
            className="p-2 rounded hover:bg-gray-200 transition-colors"
            title="Dosya Yükle"
          >
            <FileText className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={addLink}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              editor.isActive('link') ? 'bg-gray-300' : ''
            }`}
            title="Link Ekle"
          >
            <LinkIcon className="h-4 w-4 text-gray-700" />
          </button>

          <div className="w-px h-8 bg-gray-300 mx-1"></div>

          {/* Undo/Redo */}
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-2 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Geri Al"
          >
            <Undo className="h-4 w-4 text-gray-700" />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-2 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="İleri Al"
          >
            <Redo className="h-4 w-4 text-gray-700" />
          </button>
        </div>

        {/* Editor Content */}
        <div className="bg-white">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* File Upload Modal */}
      {showFileUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Dosya Yükle</h3>
              <button
                type="button"
                onClick={() => setShowFileUploadModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dosya Seç
                </label>
                <label className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg cursor-pointer transition-colors border-2 border-dashed border-gray-300">
                  <UploadIcon className="h-5 w-5" />
                  {selectedFile ? selectedFile.name : 'Dosya Seç'}
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dosya Adı
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  placeholder="Dosya adını girin"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={uploadFileAndInsertLink}
                disabled={uploading || !selectedFile || !fileName.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UploadIcon className="h-4 w-4" />
                {uploading ? 'Yükleniyor...' : 'Yükle ve Ekle'}
              </button>
              <button
                type="button"
                onClick={() => setShowFileUploadModal(false)}
                disabled={uploading}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

