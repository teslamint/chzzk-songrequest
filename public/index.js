import { io } from './socket.io.esm.min.js';

class Widget {
  constructor(channelId) {
    this._init(channelId);
  }

  _init(channelId) {
    let player;
    let isWidgetInitialized = false;
    let isPlayerReady = false;
    let playerState = -1;
    let playTimeUpdateTimer;
    const songRequests = [];
    let currentSong;

    const onPlayerReady = () => {
      console.debug('player ready');
      isPlayerReady = true;
    };

    const formatRelativeTime = (second) => {
      let _hour = Math.floor(second / 3600);
      let _minute = Math.floor((second - _hour * 3600) / 60);
      let _second = Math.floor(second % 60);
      return (
        `${_hour}`.padStart(2, '0') +
        ':' +
        `${_minute}`.padStart(2, '0') +
        ':' +
        `${_second}`.padStart(2, '0')
      );
    };

    const updatePlayTime = () => {
      if (!player || playerState !== 1) {
        return;
      }
      // update playtime
      const totalDuration = player.getDuration();
      if (totalDuration === 0) {
        // not started
        return;
      }
      const currentDuration = player.getCurrentTime();
      document.getElementById('playTime').innerText =
        `${formatRelativeTime(currentDuration)} / ${formatRelativeTime(totalDuration)}`;
    };

    const onPlayerStateChange = (event) => {
      if (event.data === YT.PlayerState.ENDED) {
        console.debug('player ended');
        playerState = 0;
        // send song_ended event to server
        if (currentSong) {
          console.debug('send song ended event to server');
          // clear ticker
          document.getElementById('songTitle').innerText = '';
          // stop animation
          document.getElementById('playTime').classList.add('stopped');
          socket.emit('song_ended', {
            id: currentSong.id,
            channelId,
          });
          playNextSong();
        }
      } else if (event.data === YT.PlayerState.PLAYING) {
        // check current song variable
        console.debug('playing video', player.getVideoUrl());
        playerState = 1;
        playTimeUpdateTimer = setInterval(updatePlayTime, 500);
      } else if (event.data === YT.PlayerState.PAUSED) {
        console.debug('player paused');
        playerState = 2;
        document.getElementById('playTime').classList.remove('stopped');
        if (playTimeUpdateTimer) {
          clearInterval(playTimeUpdateTimer);
          // reset play time
          document.getElementById('playTime').innerText = '00:00:00 / 00:00:00';
        }
      } else if (event.data === YT.PlayerState.CUED) {
        console.debug('player cued');
      }
    };

    const createPlayer = (id) => {
      if (player || isPlayerReady) {
        return;
      }
      player = new YT.Player('player', {
        width: '640',
        height: '360',
        videoId: id,
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 0,
          rel: 0,
          disablekb: 1,
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
        },
      });
    };

    const getVideoIdFromUrl = (_url) => {
      const url = new URL(_url);
      let id;
      if (url.host === 'youtu.be') {
        id = url.pathname.replace(/^\//, '');
      } else {
        id = url.searchParams.get('v');
      }
      return id;
    };

    const updateTicker = (song) => {
      if (!song) {
        return;
      }
      const ticker = document.getElementById('songTitle');
      ticker.innerText = `Now Playing - ${song.title}`;
    };

    const playSong = (song) => {
      console.debug('play song:', song);
      if (song.url) {
        const id = getVideoIdFromUrl(song.url);
        song.status = 'PLAYING';
        if (!currentSong || currentSong.id !== song.id) {
          currentSong = song;
        } else if (playerState === 1) {
          // same video, do nothing
          return;
        }
        if (!isPlayerReady) {
          createPlayer(id);
        } else {
          player.loadVideoById(id);
        }
        // start animation
        document.getElementById('playTime').classList.remove('stopped');
        updateTicker(currentSong);
        socket.emit('song_started', {
          id: song.id,
          channelId: channelId,
        });
      }
    };

    const playNextSong = () => {
      console.debug('play next song called.');
      if (songRequests.length > 0) {
        // play first song in the cue
        console.debug('play first pending song in queue');
        const nextSong = songRequests.shift();
        console.debug('play next song');
        playSong(nextSong);
      }
    };

    const deleteSongFromQueue = (song) => {
      const idx = songRequests.findIndex((item) => {
        return item.id === song.id;
      });
      if (idx > -1) {
        songRequests[idx] = null;
        delete songRequests[idx];
      }
    };

    window.addEventListener('load', () => {
      const socket = io({ transports: ['websocket'] });

      window.addEventListener('beforeunload', () => {
        // send song_stopped event to server
        socket.emit('song_stopped', {
          channelId: channelId,
        });
      });

      socket.on('widget_' + channelId, (data) => {
        if (isWidgetInitialized) {
          return;
        }
        isWidgetInitialized = true;
        const songs = JSON.parse(data);
        console.debug('initial widget data from server:', songs);
        // add queue
        songRequests.unshift(...songs);
        playNextSong();
      });

      socket.on('next_song_' + channelId, (data) => {
        const song = JSON.parse(data);
        console.debug('next song data from server:', song);
        songRequests.push(song);
        if (playerState !== 1) {
          // if player is not playing, play video now
          playNextSong();
        }
      });

      socket.on('delete_song_' + channelId, (data) => {
        const song = JSON.parse(data);
        console.debug('delete song data from server:', song);
        deleteSongFromQueue(song);
      });

      socket.on('skip_song_' + channelId, () => {
        console.debug('skip current song');
        // play next video
        playNextSong();
      });

      socket.on('connect', () => {
        const data = { id: channelId };
        socket.emit('init', data);
      });

      socket.on('disconnect', () => {
        //
      });
    });
  }
}

export { Widget };
