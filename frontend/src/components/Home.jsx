import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!username) return alert('Enter a username to board!');
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${newRoomId}`, { state: { username } });
  };

  const handleJoinRoom = () => {
    if (!username) return alert('Enter a username to board!');
    if (!roomId) return alert('Enter a Room ID (Coordinate)!');
    navigate(`/room/${roomId.toUpperCase()}`, { state: { username } });
  };

  return (
    <div style={{ minHeight: '100vh', position: 'relative', color: '#fff', overflow: 'hidden' }}>
      
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0
        }}
      >
        <source src="/Vibe.mp4" type="video/mp4" />
      </video>

      {/* Dark Overlay for Video readability */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.8) 100%)',
        zIndex: 1
      }}></div>

      {/* Navbar */}
      <header style={{ 
        position: 'relative', 
        zIndex: 10, 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '2rem 4rem' 
      }}>
        <div style={{ 
          fontSize: '2rem', 
          fontWeight: '900', 
          background: 'linear-gradient(90deg, #b026ff 0%, #00d4ff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-1px'
        }}>
          SpaceMusic
        </div>
        
        <button 
          onClick={() => setShowForm(true)}
          style={{
            background: 'linear-gradient(90deg, #b026ff 0%, #00d4ff 100%)',
            border: 'none',
            padding: '12px 32px',
            borderRadius: '50px',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(176, 38, 255, 0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onMouseOver={(e) => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 6px 25px rgba(176, 38, 255, 0.6)'; }}
          onMouseOut={(e) => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 4px 20px rgba(176, 38, 255, 0.4)'; }}
        >
          Launch Spacecraft 🚀
        </button>
      </header>

      {/* Hero Content */}
      <main style={{ 
        position: 'relative', 
        zIndex: 10, 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center', 
        alignItems: 'center',
        height: 'calc(100vh - 120px)',
        textAlign: 'center',
        padding: '0 2rem'
      }}>
        <h1 style={{ 
          fontSize: '5.5rem', 
          fontWeight: '900', 
          margin: '0 0 1rem 0',
          textShadow: '0 4px 30px rgba(0,0,0,0.8)',
          lineHeight: '1.1'
        }}>
          Vibe across the <span style={{ color: '#00d4ff' }}>galaxy.</span>
        </h1>
        <p style={{ 
          fontSize: '1.4rem', 
          color: '#e0e0e0', 
          maxWidth: '700px', 
          lineHeight: '1.6',
          textShadow: '0 2px 10px rgba(0,0,0,0.8)'
        }}>
          Listen to music together with your crew in perfect sync, no matter where you are in the universe. 
          Create a room, invite friends, and start the party.
        </p>
      </main>

      {/* Modal Overlay for Joining/Creating Room */}
      {showForm && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(15px)',
          zIndex: 100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{ 
            background: 'rgba(20, 20, 25, 0.9)', 
            padding: '3rem', 
            borderRadius: '24px', 
            border: '1px solid rgba(0,212,255,0.3)',
            boxShadow: '0 0 50px rgba(0,0,0,0.5)',
            width: '100%',
            maxWidth: '450px',
            position: 'relative'
          }}>
            <button 
              onClick={() => setShowForm(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1.5rem',
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '1.5rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <h3 style={{ margin: '0 0 2rem 0', color: '#00d4ff', textAlign: 'center', fontSize: '1.5rem' }}>Enter Coordinates</h3>
            
            <input 
              type="text" 
              className="input-field" 
              placeholder="Astronaut Name (Username)" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', marginBottom: '1.5rem', padding: '16px' }}
            />
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Room ID to Join" 
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                style={{ marginBottom: 0, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', padding: '16px' }}
              />
              <button 
                className="btn-primary" 
                onClick={handleJoinRoom}
                style={{ background: '#00d4ff', color: '#000', padding: '0 24px' }}
              >
                Join
              </button>
            </div>

            <div style={{ textAlign: 'center', margin: '20px 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>OR CREATE A NEW ONE</div>

            <button 
              className="btn-primary" 
              onClick={handleCreateRoom}
              style={{ width: '100%', background: 'linear-gradient(90deg, #b026ff 0%, #00d4ff 100%)', color: '#fff', padding: '16px' }}
            >
              Create New Base
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
