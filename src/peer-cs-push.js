var video = document.getElementById("player");
var mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
var queue=[];
var first=true;	
var once=true;
var mediaSource = null;
function handleChunk(sourceBuffer,e){
	//add stream to the queue
	queue.push(e.data);
        if(first){
		//Header is sent to player (consume stream of the queue)
		//var chunk=new Uint8Array(queue.shift());	
		//sourceBuffer.appendBuffer(chunk);
		var chunk=queue.shift();	
		sourceBuffer.appendBuffer(chunk);
		first=false;		
	}
}
function sourceOpen(e) {
  var sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
  
  sourceBuffer.addEventListener('updateend', function() {
	  if (queue.length) {
 		//Sent to player (consume stream of the queue)
	  	var chunk=queue.shift();
		sourceBuffer.appendBuffer(chunk); 
	 }else{
		first=true;
		//It is possible it consume too quickly and it is not the end
		//mediaSource.endOfStream();
	 }
  });
 
  console.log('mediaSource readyState: ' + this.readyState);
  try {
	//use the ip of your ws server
	var host = "ws://150.214.150.68:4560/";
				
	s = new WebSocket(host);
	s.binaryType = "arraybuffer";
	s.onopen = function (e) { console.log("connected..."); };
	s.onclose = function (e) { console.log("connection closed."); };
	s.onerror = function (e) { console.log("connection error."); };
	s.onmessage = function (e) { handleChunk(sourceBuffer,e);};
  } catch (ex) {
	console.log("connection exception:" + ex);
  } 
}
//mediaSource.addEventListener('sourceopen', callback);
//mediaSource.addEventListener('webkitsourceended', function(e) {
//  logger.log('mediaSource readyState: ' + this.readyState);
//}, false);

