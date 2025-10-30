"use client"

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Send } from "lucide-react";

export function MirasAssistant() {
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;

    // Add user message
    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);

    // Simulate assistant response
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Merhaba! Yakında sizlere yardımcı olacağız.'
      }]);
    }, 500);

    setChatInput('');
  };

  if (!isMounted) return null;

  return (
    <>
      {/* Floating Chatbot Button - Fixed to viewport using Portal */}
      {createPortal(
        <button
          onClick={() => setShowChatModal(!showChatModal)}
          className="w-18 h-18 rounded-full shadow-2xl hover:scale-110 transition-transform overflow-hidden bg-white/60"
          style={{
            position: 'fixed',
            bottom: '32px',
            right: '48px',
            zIndex: 9999
          }}
        >
          <img
            src="/miras_nobg.png"
            alt="MIRAS Assistant"
            className="w-full h-full object-contain"
          />
        </button>,
        document.body
      )}

      {/* Chat Modal */}
      {showChatModal && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => setShowChatModal(false)}
          />

          {/* Modal */}
          <div
            className="w-96 h-[500px] bg-white rounded-xl shadow-2xl flex flex-col"
            style={{
              position: 'fixed',
              bottom: '108px',
              right: '48px',
              zIndex: 9999
            }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-800 to-orange-500 p-4 rounded-t-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                <img src="/miras_nobg.png" alt="MIRAS" className="w-16 h-10" />
              </div>
              <div>
                <h3 className="text-white font-bold">MIRAS Assistant</h3>
                <p className="text-blue-100 text-xs">Yapay Zeka Asistanı</p>
              </div>
            </div>
            <button
              onClick={() => setShowChatModal(false)}
              className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <img src="/miras_nobg.png" alt="MIRAS" className="w-24 h-24 mx-auto mb-4 opacity-50" />
                <p>Merhaba! Ben MIRAS Assistant.</p>
                <p className="text-sm">Size nasıl yardımcı olabilirim?</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Mesajınızı yazın..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendMessage}
                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
