/*
GNU GENERAL PUBLIC LICENSE

This is an example of a client-side for a multi-party chat over WebRTC.

Copyright (C) 2014 Cristóbal Medina López.
http://www.p2psp.org

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var signalingChannel = new WebSocket("ws://127.0.0.1:4561/"); //server.py IP
signalingChannel.binaryType = "arraybuffer";
var configuration = {iceServers: [{ url: 'stun:stun.l.google.com:19302' }]};
var pcs=[];
var channel=[];
var idpeer=0;
var peerlist=[];
var peer_index = 0;
var iniConnection = document.getElementById("initiateConnection");
var sender = document.getElementById("btnSender");
var receiver = document.getElementById("btnReceiver");
var icecandidates = document.getElementById("candidateices");
var creator=document.getElementById("creator");
var btnStream= document.getElementById("streamit");
var temp=0;
splitter = -1;
var pending = 0;
var last_msg_from_splitter = null;
var last_erased = 0.0;
btnStream.disabled=false;

// ---------------- Streaming Video Part ----------------

window.MediaSource = window.MediaSource || window.WebKitMediaSource;
if (!!!window.MediaSource) {
  alert('MediaSource API is not available :_(');
}

window.RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
if (!!!window.RTCPeerConnection || !!!window.RTCIceCandidate || !!!window.RTCSessionDescription) {
  alert('WebRTC API is not available :_(');
}

var sourceBuffer;
var buffer_size = 128;
var chunk_to_play = 0;
var buffer_target = (buffer_size/10);
var queue = new Array(buffer_size);
var current = 0;
var video = document.getElementById("player");
var mediaSource = new MediaSource;
var lack_count = 0;
video.src = URL.createObjectURL(mediaSource);
mediaSource.addEventListener('sourceopen', onSourceOpen);


function handleChunk(chunk, number_of_chunk){	
	queue[number_of_chunk%buffer_size] = chunk
	appendChunk();
	current++;
	document.getElementById('byte_range').textContent = "send/received: "+current;
}

var sourceBuffer = null;
function onSourceOpen() {
    // For TS
    //sourceBuffer = mediaSource.addSourceBuffer('video/mp2t');
    // For MP4 framented
    sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.64001E, mp4a.40.2"');
    //For WebM (VP9+Opus)
    //sourceBuffer = mediaSource.addSourceBuffer('video/webm;codecs="vp9,opus"');
    //sourceBuffer.mode = 'segments';
    //videoTag.addEventListener('seeking', onSeeking.bind(videoTag, mediaSource));
    //videoTag.addEventListener('progress', onProgress.bind(videoTag, mediaSource));

    video.addEventListener('timeupdate', cleanBuffer);
    video.addEventListener('canplay', function () {
            video.play();
    });
    video.addEventListener('seeking', seek);
  }

function cleanBuffer(){
	if (video.currentTime > (buffer_target)){
		if (!sourceBuffer.updating){
			sourceBuffer.remove(last_erased, (buffer_target/1.5));
			console.log("%cBuffer Removed from: "+last_erased+" until "+(buffer_target/1.5), "color:#04B431");
			last_erased = (buffer_target/1.5);
			buffer_target = (video.currentTime + (buffer_size/10));
		}
	}
}

function seek (e) {
	console.log(e);
	if (mediaSource.readyState === 'open') {
	  sourceBuffer.abort();
	  console.log(mediaSource.readyState);
	} else {
	  console.log('seek but not open?');
	  console.log(mediaSource.readyState);
	}
}


function appendChunk(){
	if (queue[chunk_to_play] != null){
	    if (!sourceBuffer.updating){
        	chunk = new Uint8Array(queue[chunk_to_play]);
		queue[chunk_to_play] = null;
	        sourceBuffer.appendBuffer(chunk);
		chunk_to_play = (chunk_to_play + 1) % buffer_size;
		lack_count = 0;
	    }
	}else{
		if (lack_count < 15){
			console.log("lack of chunk " + chunk_to_play + " waiting...");
			lack_count = lack_count + 1;
		}else{
			lack_count = 0;
			console.log("%clack of chunk " + chunk_to_play + " lost!",'color: #DF0101');
			chunk_to_play = (chunk_to_play + 1) % buffer_size;
		}
	}
}

// ----------------- WebRTC Part --------------------
//
var isInitiator=false;
iniConnection.onclick=function(e){
	var i=document.getElementById("msg").value;
	splitter = i;
	start(true,i);
	iniConnection.disabled=true;
};


// call start(true,i) to initiate
function start(isInitiator,i) {
	console.log("creado para: "+i);
	pcs[i] = new RTCPeerConnection(configuration);
	

	// send any ice candidates to the other peer
	pcs[i].onicecandidate = function (evt) {
		signalingChannel.send(JSON.stringify({ "candidate": evt.candidate , "idtransmitter":'"'+idpeer+'"', "idreceiver":'"'+i+'"'}));
	};


	// let the "negotiationneeded" event trigger offer generation
	pcs[i].onnegotiationneeded = function () {
		pcs[i].createOffer().then(function(offer){
			return pcs[i].setLocalDescription(offer);
		})
		.then(function() {
			signalingChannel.send(JSON.stringify({ "sdp": pcs[i].localDescription , "idtransmitter":'"'+idpeer+'"', "idreceiver":'"'+i+'"'}));			
			console.log("Create and send OFFER");
			
		})
		.catch(logError)
		
	};

	if (isInitiator) {
		// create data channel and setup chat
		/*var dataChannelOptions = {
		  ordered: false, // do not guarantee order
		  maxRetransmitTime: 3000, // in milliseconds
		};*/
		channel[i] = pcs[i].createDataChannel("chat"+i);//, dataChannelOptions);
		setupChat(i);
	} else {
	// setup chat on incoming data channel
		pcs[i].ondatachannel = function (evt) {
			channel[i] = evt.channel;
			setupChat(i);
			if (splitter == -1){
				sendPeerList(i);
			}
		};
	}  
	peerlist.push(i);
	console.log("PEER LIST UPDATE: "+peerlist);
	console.log("Saved in slot: "+i);
}

signalingChannel.onmessage = function (evt) {
	handleMessage(evt);
}

function handleMessage(evt){
	var message = JSON.parse(evt.data);
	
	if (message.numpeer){    
		idpeer=message.numpeer;
		console.log('Peer ID: '+idpeer);
		document.getElementById('PeerID').textContent = idpeer;
		return;  	
	}  

   
    var id=(message.idtransmitter).split('"').join(''); 
	var idreceiver=(message.idreceiver).split('"').join(''); 
    console.log("Received from: "+id+" and send to: "+idreceiver);

    if (!pcs[id]) { 
		console.log('%cCreate a new PeerConection','background: #222; color: #bada55');
		
		start(false,id);
    } 	

    if (message.sdp && idreceiver==idpeer){
        console.log(message.sdp);
		if (message.sdp.type == "offer"){   
			pcs[id].setRemoteDescription(message.sdp).then(function () {
				return pcs[id].createAnswer();
			})
			.then(function (answer) {
				return pcs[id].setLocalDescription(answer);
				console.log("remoteDescription is Set");
			})
			.then(function  () {
				signalingChannel.send(JSON.stringify({ "sdp": pcs[id].localDescription , "idtransmitter":'"'+idpeer+'"', "idreceiver":'"'+id+'"'}));			
				console.log("Create and send ANSWER");
			})
			.catch(logError);
		}else
			pcs[id].setRemoteDescription(message.sdp).catch(logError);
	}else if (message.candidate){
		console.log(message.candidate)
		pcs[id].addIceCandidate(message.candidate).catch(logError);
		console.log("Received ice candidate: "+ message.candidate);
	}
}


function setupChat(i) {
    channel[i].onopen = function () {
	console.log("Channel Open");
    	btnStream.disabled = false;
	/*
	if (splitter == 0){
		sendPeerList(i);
	}
	*/
    };

    channel[i].onmessage = function (evt) {

        var msg_stream = evt.data;


	if (typeof msg_stream == "string"){    
		incoming_peerlist=JSON.parse(msg_stream);
		list = incoming_peerlist.peerlist;
		//console.log(list);
		for (i=0; i<list.length; i++){
			//console.log("incoming: "+list[i]);
			if (list[i] != idpeer)
				start(true,list[i]);	
		}
		return;  	
    	} 
     


       var sender = new Uint16Array(msg_stream.slice(0,2))[0];
       //console.log("chunk received from "+sender+" spl= "+splitter);

       if (sender == splitter){

	     while(pending > 0){
		console.log("brush mode!!!");
     	    	sendChatMessage(last_msg_from_splitter);
     	    	pending = pending - 1;
             }
	     var chunk_array = new Uint8Array(msg_stream);
	     var msg_stream_updated = new Uint8Array(msg_stream);
	
	     var sender_id = new Uint8Array(2);
	     sender_id[0] = idpeer;
	     sender_id[1] = idpeer>>8;	
	

	     msg_stream_updated.set(sender_id, 0);
	     msg_stream_updated.set(chunk_array.slice(2),2);
	
	     last_msg_from_splitter = msg_stream_updated.buffer;
	     pending = (peerlist.length-1);
	     
	}
        if (last_msg_from_splitter != null && pending > 0){
     	    sendChatMessage(last_msg_from_splitter);
     	    pending = pending - 1;
         }
	

       //console.log("chunk "+ (new Uint16Array(msg_stream.slice(2,4)))[0] +" received from "+sender+" spl= "+splitter);
       handleChunk(msg_stream.slice(4), (new Uint16Array(msg_stream.slice(2,4)))[0]);

    };
}

function sendPeerList(peer){
	console.log("Sending list of peers to: " + peer); 
	try{
		channel[peer].send(JSON.stringify({peerlist}));
	}catch(e){
		console.log(i+" said bye!");
	}
}

function sendChatMessage(chunk) {

	if (peerlist[peer_index] == splitter){
		//console.log("next is the splitter");
		peer_index = (peer_index + 1) % peerlist.length;
	}

	//console.log("send to "+peerlist[i]); 
	//console.log("Sending chunk "+ (new Uint16Array(chunk.slice(2,4)))[0] + " to peer: " + peerlist[peer_index]); 
	try{
		channel[peerlist[peer_index]].send(chunk);
	}catch(e){
		console.log(peerlist[peer_index]+" said bye!");
	}

	peer_index = (peer_index + 1) % peerlist.length;
}

//----------------- File Load Part --------------------
//http://www.html5rocks.com/es/tutorials/file/dndfiles

var number_of_chunk = 0;
function readBlob(time) {
	
    var files = document.getElementById('files').files;
    if (!files.length) {
      alert('Please select a file!');
      return;
    }

    var file = files[0];
    var start = time;
    var stop = file.size - 1;
	if (time>file.size)
		return;
    var reader = new FileReader();
	
    // If we use onloadend, we need to check the readyState.
    reader.onloadend = function(evt) {

      if (evt.target.readyState == FileReader.DONE) { // DONE == 2
	var chunk = evt.target.result;
	handleChunk(chunk, number_of_chunk);


	var chunk_array = new Uint8Array(chunk);
	var msg_stream = new Uint8Array(chunk.byteLength + 2 + 2);
	
	var sender_id = new Uint8Array(2);
	sender_id[0] = idpeer;
	sender_id[1] = idpeer>>8;	
	
	var number_buffer = new Uint8Array(2);
	number_buffer[0] = number_of_chunk;
	number_buffer[1] = number_of_chunk>>8;

	msg_stream.set(sender_id, 0);
	msg_stream.set(number_buffer, 2);
	msg_stream.set(chunk_array,4);

	sendChatMessage(msg_stream.buffer);
	number_of_chunk = (number_of_chunk + 1) % 65536 ;
        //document.getElementById('byte_content').textContent = evt.target.result;
        //document.getElementById('byte_range').textContent = (start+1)/1024;
			
			
      }
     };
	
	/*
	reader.onload = function(e) {
		feedIt();
		//console.log('appending chunk:' + temp);
	};
	*/
	
	var blob;
	blob = file.slice(start, start + 16380)
	reader.readAsArrayBuffer(blob);
	
	
    
  }

  document.querySelector('.readBytesButtons').addEventListener('click', function(evt) {
    if (evt.target.tagName.toLowerCase() == 'button') {
		setInterval('feedIt()', 180);   
    }
  }, false);


function feedIt(){
	readBlob(temp);
	temp+=16380;
}

sender.onclick=function(e){
	document.getElementById("choose").style.display="none";
	document.getElementById("sender").style.display="inline";
	document.getElementById("warning").style.display="inline";
};

receiver.onclick=function(e){
	document.getElementById("choose").style.display="none";
	document.getElementById("receiver").style.display="inline";
};

function logError(error) {
    console.log(error.name + ": " + error.message);
}
