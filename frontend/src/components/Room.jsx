import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import YouTube from 'react-youtube';
import { Users, Search, Play, Pause, SkipForward, SkipBack, ListVideo, Video, Headphones, Copy, UserPlus, Heart, MoreHorizontal, Volume2, Maximize2, Repeat, Shuffle, GripVertical, Mic2 } from 'lucide-react';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : '');

const getCleanTitle = (title) => {
  if (!title) return '...';
  // Remove everything after |, -, [, or (
  return title.split(/\||-|\[|\(/)[0].trim();
};

const parseSyncedLyrics = (lrcString) => {
  if (!lrcString) return null;
  const lines = lrcString.split('\n');
  const parsed = [];

  for (const line of lines) {
    // Make decimals optional: [01:23] or [01:23.45]
    const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2]);
      const text = match[3].trim();
      if (text) {
        parsed.push({
          time: min * 60 + sec,
          text: text
        });
      }
    }
  }

  return parsed.length > 0 ? parsed : null;
};

export default function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const username = location.state?.username;

  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);

  const [currentSong, setCurrentSong] = useState(null);
  const [songDetails, setSongDetails] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [isVideoMode, setIsVideoMode] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [rightTab, setRightTab] = useState('queue'); // 'queue' or 'lyrics'
  const [lyrics, setLyrics] = useState({ loading: false, plain: null, synced: null });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const playerRef = useRef(null);
  const ignoreNextEvent = useRef(false);

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.emit('join_room', { roomId, username });

    newSocket.on('room_state', (state) => {
      setUsers(state.users);
      setQueue(state.queue);
      if (state.currentSong) {
        setCurrentSong(state.currentSong);
        setSongDetails(state.songDetails);
        setIsPlaying(state.isPlaying);
        setCurrentTime(state.timestamp);
      }
    });

    newSocket.on('user_joined', ({ users }) => setUsers(users));
    newSocket.on('user_left', ({ users }) => setUsers(users));
    newSocket.on('queue_update', (newQueue) => setQueue(newQueue));

    newSocket.on('play_new_song', ({ videoId, details, timestamp }) => {
      ignoreNextEvent.current = true;
      setCurrentSong(videoId);
      setSongDetails(details);
      setIsPlaying(true);
      setCurrentTime(timestamp);
      setDuration(0);
    });

    newSocket.on('stop_song', ({ lastDetails }) => {
      setCurrentSong(null);
      setSongDetails(null);
      setIsPlaying(false);

      // Only the first user (Host) triggers the auto-next to avoid duplicates
      setUsers(currentUsers => {
        const isHost = currentUsers.length > 0 && currentUsers[0].username === username;
        if (isHost && lastDetails) {
          fetchAndPopulateUpNext(lastDetails);
        }
        return currentUsers;
      });
    });

    newSocket.on('sync_play', ({ timestamp }) => {
      ignoreNextEvent.current = true;
      setIsPlaying(true);
      setCurrentTime(timestamp);
      if (playerRef.current) {
        playerRef.current.seekTo(timestamp, true);
        playerRef.current.playVideo();
      }
    });

    newSocket.on('sync_pause', ({ timestamp }) => {
      ignoreNextEvent.current = true;
      setIsPlaying(false);
      setCurrentTime(timestamp);
      if (playerRef.current) {
        playerRef.current.seekTo(timestamp, true);
        playerRef.current.pauseVideo();
      }
    });

    return () => newSocket.disconnect();
  }, [roomId, username, navigate]);

  // Update current time continuously with a robust polling mechanism
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.getPlayerState) {
        // getPlayerState() === 1 means the video is actively playing
        if (playerRef.current.getPlayerState() === 1) {
          setCurrentTime(playerRef.current.getCurrentTime() || 0);
        }
      }
    }, 100); // 100ms for near-instant lyric syncing
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to active lyric line
  useEffect(() => {
    if (rightTab === 'lyrics' && lyrics.synced) {
      const activeEl = document.getElementById('active-lyric-line');
      if (activeEl && activeEl.scrollIntoView) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, rightTab, lyrics.synced]);

  // Fetch lyrics whenever the song changes
  useEffect(() => {
    if (!songDetails) {
      setLyrics({ loading: false, plain: null, synced: null });
      return;
    }

    const fetchLyrics = async () => {
      setLyrics({ loading: true, plain: null, synced: null });
      try {
        const cleanTitle = getCleanTitle(songDetails.title);
        // Using our backend proxy to avoid CORS/User-Agent restrictions from the browser
        const res = await fetch(`${SOCKET_SERVER_URL}/api/lyrics?q=${encodeURIComponent(cleanTitle)}`);
        const data = await res.json();

        if (data && data.length > 0 && (data[0].plainLyrics || data[0].syncedLyrics)) {
          setLyrics({
            loading: false,
            plain: data[0].plainLyrics,
            synced: parseSyncedLyrics(data[0].syncedLyrics)
          });
        } else {
          setLyrics({ loading: false, plain: "Lyrics not found for this song in the database.", synced: null });
        }
      } catch (err) {
        console.error("Lyrics fetch failed", err);
        setLyrics({ loading: false, plain: "Failed to load lyrics.", synced: null });
      }
    };

    fetchLyrics();
  }, [songDetails?.title]);

  const onPlayerReady = (event) => {
    playerRef.current = event.target;
    setDuration(event.target.getDuration() || 0);
  };

  const onStateChange = (event) => {
    if (!socket || ignoreNextEvent.current) {
      ignoreNextEvent.current = false;
      return;
    }
    const timestamp = playerRef.current.getCurrentTime();
    setDuration(playerRef.current.getDuration() || 0);

    if (event.data === 1) {
      setIsPlaying(true);
      socket.emit('sync_play', { roomId, timestamp });
    } else if (event.data === 2) {
      setIsPlaying(false);
      socket.emit('sync_pause', { roomId, timestamp });
    } else if (event.data === 0) {
      socket.emit('song_ended', { roomId, lastVideoId: currentSong });
    }
  };

  // OS Media Session (Notification Controls)
  useEffect(() => {
    if ('mediaSession' in navigator && songDetails) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: getCleanTitle(songDetails.title),
        artist: songDetails.channel,
        album: 'SpaceMusic',
        artwork: [
          { src: songDetails.thumbnail, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlaying) togglePlay();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (isPlaying) togglePlay();
      });
      navigator.mediaSession.setActionHandler('nexttrack', skipNext);
    }
  }, [songDetails, isPlaying, currentSong]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if it is a direct YouTube URL
    const urlMatch = searchQuery.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    if (urlMatch) {
      const videoId = urlMatch[1];
      handleAddToQueue(videoId);
      return;
    }

    const API_KEY = 'AIzaSyANRBDBHFV9yON6GU9walyF9dHaggulou0';
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=10&key=${API_KEY}`);
      const data = await res.json();
      if (data.items) {
        setSearchResults(data.items);
      }
    } catch (err) {
      console.error('Search failed', err);
    }
  };

  const fetchAndPopulateUpNext = async (details) => {
    if (!details || !socket) return;
    const API_KEY = 'AIzaSyANRBDBHFV9yON6GU9walyF9dHaggulou0';
    // Use just the channel to get their other top songs instead of the same song name
    const query = encodeURIComponent(`${details.channel} top hit songs`);
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=10&key=${API_KEY}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        // Filter out the current song and any exact title matches to avoid repeats
        const nextItems = data.items
          .filter(item => item.id.videoId !== details.videoId && !item.snippet.title.includes(details.title.substring(0, 10)))
          .map(item => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.high.url
          }));

        if (nextItems.length > 0) {
          socket.emit('append_multiple_to_queue', { roomId, items: nextItems });
        }
      }
    } catch (err) {
      console.error('Failed to populate up next', err);
    }
  };

  const handleAddToQueue = (item) => {
    const isDirectId = typeof item === 'string';
    const videoId = isDirectId ? item : item.id.videoId;
    const details = isDirectId ? { videoId, title: 'Unknown Song (via ID)', channel: '', thumbnail: `https://img.youtube.com/vi/${videoId}/default.jpg` } : {
      videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high.url
    };

    // Play the newly searched song immediately!
    socket.emit('play_now', { roomId, item: details });

    // Auto-populate the rest of the queue based on this new song
    if (!isDirectId) {
      fetchAndPopulateUpNext(details);
    }

    setSearchResults([]);
    setSearchQuery('');
  };

  const togglePlay = () => {
    if (!playerRef.current || !currentSong) return;
    const timestamp = playerRef.current.getCurrentTime();
    if (isPlaying) {
      playerRef.current.pauseVideo();
      socket.emit('sync_pause', { roomId, timestamp });
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      socket.emit('sync_play', { roomId, timestamp });
      setIsPlaying(true);
    }
  };

  const skipNext = () => {
    if (currentSong && socket) {
      socket.emit('song_ended', { roomId, lastVideoId: currentSong });
    }
  };

  const handlePlayQueueItem = (index) => {
    if (socket) {
      socket.emit('play_queue_item', { roomId, index });
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (playerRef.current) {
      playerRef.current.seekTo(newTime, true);
      if (socket) {
        socket.emit('sync_play', { roomId, timestamp: newTime });
      }
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Generate dynamic progress bar gradient string
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const progressStyle = {
    background: `linear-gradient(to right, #a855f7 ${progressPercent}%, rgba(255, 255, 255, 0.1) ${progressPercent}%)`
  };

  return (
    <div className="app-container">
      <div className="main-content">

        {/* Left Sidebar */}
        <div className="sidebar glass-panel">
          <div className="logo-container">
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '20px', height: '2px', background: '#06b6d4', transform: 'rotate(-45deg)' }}></div>
            </div>
            <h1 className="logo-text">Space<span>Music</span></h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '-16px', marginLeft: '44px' }}>Listen Together • Beyond Boundaries</p>

          <div className="room-card">
            <div>
              <div style={{ fontSize: '0.7rem', color: '#a1a1aa', marginBottom: '4px', fontWeight: 'bold', letterSpacing: '1px' }}>ROOM ID</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '800', letterSpacing: '2px' }}>{roomId}</div>
            </div>
            <button className="control-btn" onClick={() => navigator.clipboard.writeText(roomId)} title="Copy Room ID">
              <Copy size={18} />
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.9rem', color: '#e4e4e7', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} /> Listeners ({users.length})
            </h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {users.map((u, i) => (
                <div key={i} className="listener-item">
                  <div className="avatar">
                    <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '1rem' }}>{u.username.charAt(0).toUpperCase()}</span>
                    <div className="status-dot"></div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="text-truncate">{u.username} {u.username === username ? '(You)' : ''}</span>
                      {i === 0 && <span style={{ color: '#fbbf24', fontSize: '0.8rem' }}>👑</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                      {i === 0 ? 'Listening now' : 'Online'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <UserPlus size={18} /> Invite Friends
          </button>
        </div>

        {/* Center Main View */}
        <div className="center-view glass-panel">

          <div className="search-container">
            <form onSubmit={handleSearch}>
              <Search className="search-icon" size={20} />
              <input
                type="text"
                className="input-field"
                placeholder="Search a song to add to queue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          </div>

          <div className="center-scroll">
            {searchResults.length > 0 ? (
              <div style={{ width: '100%', maxWidth: '700px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#e4e4e7' }}>Search Results</h3>
                {searchResults.map(item => (
                  <div key={item.id.videoId} className="queue-item" onClick={() => handleAddToQueue(item)} style={{ background: 'rgba(255,255,255,0.03)', marginBottom: '12px', cursor: 'pointer' }}>
                    <img src={item.snippet.thumbnails.default.url} alt="thumbnail" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-truncate" style={{ fontWeight: '600', color: '#fff', fontSize: '1rem', marginBottom: '4px' }}>{item.snippet.title}</div>
                      <div className="text-truncate" style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>{item.snippet.channelTitle}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' }}>
                {currentSong ? (
                  <div className="active-song-card">
                    <div className="artwork-container">
                      {/* Audio Mode Image */}
                      <img
                        src={songDetails ? songDetails.thumbnail : `https://img.youtube.com/vi/${currentSong}/maxresdefault.jpg`}
                        alt="Album Art"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          opacity: isVideoMode ? 0 : 1,
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          transition: 'opacity 0.3s ease',
                          zIndex: 1
                        }}
                      />

                      {/* Video Player */}
                      <div style={{
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        zIndex: 2,
                        opacity: isVideoMode ? 1 : 0,
                        pointerEvents: isVideoMode ? 'auto' : 'none',
                        transition: 'opacity 0.3s ease'
                      }}>
                        {/* Glass Shield to block ALL clicks to YouTube */}
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, background: 'transparent' }} />
                        <YouTube
                          videoId={currentSong}
                          opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, controls: 0, modestbranding: 1, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3 } }}
                          onReady={onPlayerReady}
                          onStateChange={onStateChange}
                          style={{ width: '100%', height: '100%', pointerEvents: 'none', transform: 'scale(1.4)', transformOrigin: 'center center' }}
                        />
                      </div>
                    </div>

                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: '8px', position: 'relative' }}>
                        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                          <h2 className="text-truncate" style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '600' }}>
                            {songDetails ? getCleanTitle(songDetails.title) : 'Playing Song...'}
                          </h2>
                        </div>
                        <div style={{ position: 'absolute', right: '0' }}>
                          <Heart size={24} color="#ec4899" fill="#ec4899" style={{ cursor: 'pointer', filter: 'drop-shadow(0 0 10px rgba(236, 72, 153, 0.5))' }} />
                        </div>
                      </div>
                      <div className="genre-pills">
                        <span className="pill">Chill</span>
                        <span className="pill">Electronic</span>
                        <span className="pill">Lo-Fi</span>
                        <span className="pill">Space</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#a1a1aa', textAlign: 'center', opacity: 0.6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                      <Search size={40} color="#a855f7" />
                    </div>
                    <h2 style={{ color: '#fff', marginBottom: '8px' }}>Search for a song to start listening</h2>
                    <p style={{ fontSize: '0.9rem' }}>Find your next track and listen together with your room.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Queue / Lyrics Sidebar */}
        <div className="queue-sidebar glass-panel">

          <div style={{ display: 'flex', marginBottom: '24px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', padding: '4px' }}>
            <button
              style={{ flex: 1, padding: '8px 16px', borderRadius: '50px', border: 'none', background: rightTab === 'queue' ? 'rgba(168, 85, 247, 0.3)' : 'transparent', color: rightTab === 'queue' ? '#fff' : '#a1a1aa', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => setRightTab('queue')}
            >
              <ListVideo size={16} /> Up Next
            </button>
            <button
              style={{ flex: 1, padding: '8px 16px', borderRadius: '50px', border: 'none', background: rightTab === 'lyrics' ? 'rgba(168, 85, 247, 0.3)' : 'transparent', color: rightTab === 'lyrics' ? '#fff' : '#a1a1aa', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => setRightTab('lyrics')}
            >
              <Mic2 size={16} /> Lyrics
            </button>
          </div>

          {rightTab === 'queue' ? (
            <div className="queue-list" style={{ display: 'flex', flexDirection: 'column' }}>
              {queue.length === 0 ? (
                <div style={{ color: '#a1a1aa', fontSize: '0.9rem', textAlign: 'center', marginTop: '3rem' }}>
                  Queue is empty.<br /><br />Search and add songs!
                </div>
              ) : (
                queue.map((item, index) => (
                  <div key={index} className="queue-item" onClick={() => handlePlayQueueItem(index)}>
                    <div style={{ width: '24px', fontSize: '0.9rem', color: '#a1a1aa', fontWeight: 'bold' }}>
                      {(index + 1).toString().padStart(2, '0')}
                    </div>
                    <img src={item.thumbnail} alt="thumb" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-truncate" style={{ fontSize: '0.95rem', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
                        {getCleanTitle(item.title)}
                      </div>
                      <div className="text-truncate" style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
                        {item.channel}
                      </div>
                    </div>
                    <GripVertical size={16} color="#555" />
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="queue-list" style={{ padding: '0 12px', whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#e4e4e7', fontSize: '0.95rem' }}>
              {lyrics.loading ? (
                <div style={{ textAlign: 'center', color: '#a1a1aa', marginTop: '3rem' }}>Searching the universe for lyrics...</div>
              ) : lyrics.synced ? (
                <div style={{ paddingBottom: '2rem' }}>
                  {lyrics.synced.map((line, idx) => {
                    const nextLine = lyrics.synced[idx + 1];
                    // Line is active if the current time is past this line's time, AND before the next line's time.
                    // Or if it's the first line and we are still in the intro.
                    const isActive = (currentTime >= line.time && (!nextLine || currentTime < nextLine.time)) || (idx === 0 && currentTime < line.time);

                    return (
                      <div
                        key={idx}
                        id={isActive ? "active-lyric-line" : ""}
                        style={{
                          color: isActive ? '#fff' : 'rgba(255,255,255,0.3)',
                          fontSize: isActive ? '1.15rem' : '0.95rem',
                          fontWeight: isActive ? 'bold' : 'normal',
                          textShadow: isActive ? '0 0 15px rgba(168, 85, 247, 0.8)' : 'none',
                          transition: 'all 0.3s ease',
                          padding: '6px 0',
                          transform: isActive ? 'scale(1.02)' : 'scale(1)'
                        }}
                      >
                        {line.text}
                      </div>
                    );
                  })}
                </div>
              ) : lyrics.plain ? (
                <div style={{ paddingBottom: '2rem' }}>{lyrics.plain}</div>
              ) : (
                <div style={{ textAlign: 'center', color: '#a1a1aa', marginTop: '3rem' }}>Play a song to see lyrics.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Music Player */}
      <div className="bottom-player glass-panel">
        <div className="player-left">
          {currentSong ? (
            <>
              <img src={songDetails ? songDetails.thumbnail : `https://img.youtube.com/vi/${currentSong}/default.jpg`} alt="Now Playing" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-truncate" style={{ fontSize: '1rem', fontWeight: '700', color: '#fff' }}>{songDetails ? getCleanTitle(songDetails.title) : '...'}</div>
                <div className="text-truncate" style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>{songDetails ? songDetails.channel : '...'}</div>
              </div>
              <Heart size={18} color="#a1a1aa" style={{ cursor: 'pointer', marginLeft: '8px' }} />
              <MoreHorizontal size={18} color="#a1a1aa" style={{ cursor: 'pointer', marginLeft: '4px' }} />
            </>
          ) : (
            <div style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>No track playing</div>
          )}
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button className="control-btn"><Shuffle size={18} /></button>
            <button className="control-btn"><SkipBack size={22} fill="currentColor" /></button>
            <button className="control-btn play-circle-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} fill="#fff" /> : <Play size={20} fill="#fff" style={{ marginLeft: '4px' }} />}
            </button>
            <button className="control-btn" onClick={skipNext}><SkipForward size={22} fill="currentColor" /></button>
            <button className="control-btn"><Repeat size={18} /></button>
          </div>

          <div className="progress-container">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="progress-bar"
              style={progressStyle}
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-right">
          <Volume2 size={18} color="#a1a1aa" />
          <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '70%', background: '#a855f7', borderRadius: '2px' }}></div>
            <div style={{ position: 'absolute', top: '-4px', left: '70%', width: '12px', height: '12px', background: '#fff', borderRadius: '50%', boxShadow: '0 0 5px rgba(0,0,0,0.5)' }}></div>
          </div>
          <button
            className="video-mode-btn"
            onClick={() => setIsVideoMode(!isVideoMode)}
          >
            {isVideoMode ? <Headphones size={16} /> : <Video size={16} />}
            {isVideoMode ? 'Audio Mode' : 'Video Mode'}
          </button>
          <Maximize2 size={16} color="#a1a1aa" style={{ cursor: 'pointer', marginLeft: '8px' }} />
        </div>
      </div>
    </div>
  );
}
