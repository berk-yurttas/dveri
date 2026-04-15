// src/components/MusicPlayer.js
import React, { useState, useEffect, useRef } from 'react';

const MusicPlayer = ({ playlist }) => {
  const audioRef = useRef(null);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isShuffle, setIsShuffle] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.load();
    if (isPlaying) {
      audioRef.current.play().catch(error => {
        console.error("Playback error:", error);
      });
    }
  }, [currentTrack, isPlaying]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    if (!isPlaying) {
      audioRef.current.play().catch(err => console.error("Play error:", err));
    } else {
      audioRef.current.pause();
    }
  };

  const handleNext = () => {
    const nextTrack = isShuffle ? Math.floor(Math.random() * playlist.length) : (currentTrack + 1) % playlist.length;
    setCurrentTrack(nextTrack);
  };

  const handlePrev = () => {
    const prevTrack = isShuffle ? Math.floor(Math.random() * playlist.length) : (currentTrack - 1 + playlist.length) % playlist.length;
    setCurrentTrack(prevTrack);
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);

  const containerStyle = {
    position: 'fixed',
    bottom: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    width: '300px', // Reduced width
    height: '50px', // Reduced height
    backgroundColor: '#333',
    borderRadius: '25px', // Smoother border radius
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '0 10px', // Reduced padding
    boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
  };

  const buttonStyle = {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '16px', // Smaller font size
    cursor: 'pointer',
    outline: 'none',
  };

  const sliderContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    width: '80px', // Smaller slider container
  };

  const sliderStyle = {
    width: '100%',
    cursor: 'pointer',
  };

  return (
    <div style={containerStyle}>
      <audio ref={audioRef} src={playlist[currentTrack]} onEnded={handleNext} style={{ display: 'none' }} />
      <button onClick={toggleShuffle} style={buttonStyle}>{isShuffle ? "🔀" : "🔁"}</button>
      <button onClick={handlePrev} style={buttonStyle}>⏮</button>
      <button onClick={handlePlayPause} style={{ ...buttonStyle, fontSize: '18px' }}>{isPlaying ? "⏸" : "▶"}</button>
      <button onClick={handleNext} style={buttonStyle}>⏭</button>
      <div style={sliderContainerStyle}>
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={sliderStyle} />
      </div>
    </div>
  );
};

export default MusicPlayer;
