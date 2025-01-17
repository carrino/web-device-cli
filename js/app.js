'use strict';

const bleNusServiceUUID  = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const bleNusCharRXUUID   = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const bleNusCharTXUUID   = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const MTU = 244;
const NUM_POINTS = 2000;
const DATA_LEN = 26 * NUM_POINTS + 28;

var bleDevice;
var bleServer;
var nusService;
var rxCharacteristic;
var txCharacteristic;

var connected = false;
var buf = new ArrayBuffer(DATA_LEN);
var index = 0;
var view = new DataView(buf);

function connectionToggle() {
    if (connected || bleDevice) {
        disconnect();
    } else {
        connect();
    }
    document.getElementById('terminal').focus();
}

// Sets button to either Connect or Disconnect
function setConnButtonState(enabled) {
    if (enabled) {
        document.getElementById("clientConnectButton").innerHTML = "Disconnect from " + bleDevice.name;
        document.getElementById("clientConnectButton").style.backgroundColor = null;
    } else {
      if (bleDevice) {
        document.getElementById("clientConnectButton").innerHTML = "Disconnect from " + bleDevice.name;
        document.getElementById("clientConnectButton").style.backgroundColor = 'red';
      } else {
        document.getElementById("clientConnectButton").innerHTML = "Connect";
        document.getElementById("clientConnectButton").style.backgroundColor = null;
      }
    }
}

function connect() {
    if (!navigator.bluetooth) {
        console.log('WebBluetooth API is not available.\r\n' +
                    'Please make sure the Web Bluetooth flag is enabled.');
        return;
    }
    console.log('Requesting Bluetooth Device...');
    var promise = navigator.bluetooth.requestDevice({
        //filters: [{services: []}]
        filters: [{namePrefix: ['GyroDisc']}],
        optionalServices: [bleNusServiceUUID],
        acceptAllDevices: false
    })
    connectDevice(promise);
}

function onAdvertisement(event) {
  console.log('Advertisement received.');
  console.log('  Device Name: ' + event.device.name);
  console.log('  Device ID: ' + event.device.id);
  console.log('  RSSI: ' + event.rssi);
  console.log('  TX Power: ' + event.txPower);
  console.log('  UUIDs: ' + event.uuids);
  event.device.unwatchAdvertisements();
  connectDevice(Promise.resolve(event.device));
}


function connectDevice(devicePromise) {
    devicePromise
    .then(device => {
        bleDevice = device; 
        console.log('Found ' + device.name);
        console.log('Connecting to GATT Server...');
        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        bleDevice.addEventListener('advertisementreceived', onAdvertisement);
        return device.gatt.connect();
    })
    .then(server => {
        console.log('Locate NUS service');
        return server.getPrimaryService(bleNusServiceUUID);
    }).then(service => {
        nusService = service;
        console.log('Found NUS service: ' + service.uuid);
    })
    .then(() => {
        console.log('Locate RX characteristic');
        return nusService.getCharacteristic(bleNusCharRXUUID);
    })
    .then(characteristic => {
        rxCharacteristic = characteristic;
        console.log('Found RX characteristic');
    })
    .then(() => {
        console.log('Locate TX characteristic');
        return nusService.getCharacteristic(bleNusCharTXUUID);
    })
    .then(characteristic => {
        txCharacteristic = characteristic;
        console.log('Found TX characteristic');
    })
    .then(() => {
        console.log('Enable notifications');
        return txCharacteristic.startNotifications();
    })
    .then(() => {
        console.log('Notifications started');
        txCharacteristic.addEventListener('characteristicvaluechanged',
                                          handleNotifications);
        connected = true;
	bleDevice.watchAdvertisements();
        console.log('\r\n' + bleDevice.name + ' Connected.');
        setConnButtonState(true);
    })
    .catch(error => {
        console.log('' + error);
        if(bleDevice && bleDevice.gatt.connected)
        {
            bleDevice.gatt.disconnect();
        }
        if (bleDevice) {
	  bleDevice.watchAdvertisements();
        }
        setConnButtonState(false);
    });
}

function disconnect() {
    if (!bleDevice) {
        console.log('No Bluetooth Device connected...');
        return;
    }
    console.log('Disconnecting from Bluetooth Device...');
    if (bleDevice.gatt.connected) {
        bleDevice.removeEventListener('advertisementreceived', onAdvertisement);
        bleDevice.gatt.disconnect();
        bleDevice.unwatchAdvertisements();
        connected = false;
    } else {
        console.log('> Bluetooth Device is already disconnected');
    }
    bleDevice = null;
    setConnButtonState(false);
}

function onDisconnected() {
    connected = false;
    console.log('\r\n' + bleDevice.name + ' Disconnected.');
    setConnButtonState(false);
}

function handleNotifications(event) {
    console.log('notification');
    let value = event.target.value;
    for (let i = 0; i < value.byteLength; i++) {
        if (index == DATA_LEN) {
	    console.log('> Extra Data');
            return;
        }
        view.setUint8(index++, value.getUint8(i));
    }

    if (index == DATA_LEN) {
        console.log('> Transfer Complete');
        var file = new Blob([buf], {type: 'application/octet-stream'});
        //window.navigator.msSaveOrOpenBlob(file, "throw_" + Date.now() + ".throw");

        var firstDuration = view.getInt16(0);
        var firstAccelX = view.getFloat32(NUM_POINTS/2);
        var firstAccelY = view.getFloat32(NUM_POINTS/2 + 1);
        var firstAccelZ = view.getFloat32(NUM_POINTS/2 + 2);
        var firstGyroX = view.getFloat32(NUM_POINTS/2 + NUM_POINTS*3);
        var firstGyroY = view.getFloat32(NUM_POINTS/2 + NUM_POINTS*3 + 1);
        var firstGyroZ = view.getFloat32(NUM_POINTS/2 + NUM_POINTS*3 + 2);

        var a = document.createElement("a");
        var url = URL.createObjectURL(file);
        a.href = url;
        a.download = "throw_" + Date.now() + ".throw";  // file name
        document.body.appendChild(a);
        a.click();
        nusSendString("ack");
	index = 0;
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);  
        }, 0); 

    }
}

function ignoreString(s) {
//
}

function nusSendString(s) {
    index = 0;
    if(bleDevice && bleDevice.gatt.connected) {
        console.log("send: " + s);
        let val_arr = new Uint8Array(s.length)
        for (let i = 0; i < s.length; i++) {
            let val = s[i].charCodeAt(0);
            val_arr[i] = val;
        }
        sendNextChunk(val_arr);
    } else {
        console.log('Not connected to a device yet.');
    }
}

function sendNextChunk(a) {
    let chunk = a.slice(0, MTU);
    rxCharacteristic.writeValue(chunk)
      .then(function() {
          if (a.length > MTU) {
              sendNextChunk(a.slice(MTU));
          }
      });
}



function initContent(io) {
    io.println("\r\n\
Welcome to Web Device CLI V0.1.0 (03/19/2019)\r\n\
Copyright (C) 2019  makerdiary.\r\n\
\r\n\
This is a Web Command Line Interface via NUS (Nordic UART Service) using Web Bluetooth.\r\n\
\r\n\
  * Source: https://github.com/makerdiary/web-device-cli\r\n\
  * Live:   https://makerdiary.github.io/web-device-cli\r\n\
");
}

function setupHterm() {
    const term = new hterm.Terminal();

    term.onTerminalReady = function() {
        const io = this.io.push();
        io.onVTKeystroke = (string) => {
            ignoreString(string);
        };
        io.sendString = ignoreString;
        initContent(io);
        this.setCursorVisible(true);
        this.keyboard.characterEncoding = 'raw';
    };
    term.decorate(document.querySelector('#terminal'));
    term.installKeyboard();

    term.contextMenu.setItems([
        ['Terminal Reset', () => {term.reset(); initContent(window.term_.io);}],
        ['Terminal Clear', () => {term.clearHome();}],
        [hterm.ContextMenu.SEPARATOR],
        ['GitHub', function() {
            lib.f.openWindow('https://github.com/makerdiary/web-device-cli', '_blank');
        }],
    ]);

    // Useful for console debugging.
    window.term_ = term;
}

window.onload = function() {
    //lib.init(setupHterm);
};

