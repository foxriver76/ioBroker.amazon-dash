/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const utils = require('@iobroker/adapter-core');
const int_array_to_hex = require('lib/helpers.js').int_array_to_hex;
const pcap = require('pcap');
let adapter;

let MACs = [
    '747548',
    'F0D2F1',
    '8871E5',
    '74C246',
    'F0272D',
    '34D270',
    '0C47C9',
    'A002DC',
    'AC63BE',
    '44650D',
    '50F5DA',
    '84D6D0',
    'B47C9C',
    'FCA667',
    '18742E',
    '78E103',
    '6837E9',
    '00FC8B',
    '40B4CD',
    'FC65DE',
    '2C3AE8',
    '6C5697',
    '38F73D',
    '6854FD'
];

String.prototype.replaceAll = function (search, replacement) {
    const target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: 'amazon-dash'
    });

    adapter = new utils.Adapter(options);

    adapter.on('ready', function () {
        main();
    });

    adapter.on('unload', (callback) => {
        try {
            adapter.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    });

    return adapter;
} // endStartAdapter

function main() {
    if (adapter.config.devices && adapter.config.devices.length) {
        for (let k = 0; k < adapter.config.devices.length; k++) {
            const mac = adapter.config.devices[k].mac;
            const macOK = mac.replaceAll(':', '');

            if (macOK.length > 5) {
                MACs.push(macOK.substring(0, 6));
                adapter.log.debug('manual MAC : ' + MACs.push(macOK.substring(0, 6)));
            }
        }
    }

    MACs = remove_duplicates(MACs);

    if (typeof adapter.config.interface == 'undefined' || adapter.config.interface === '') {
        adapter.config.interface = '';
        adapter.log.info('starting pcap session on default interface');
    } else {
        adapter.log.info('starting pcap session on interface ' + adapter.config.interface);
    }


    const pcap_session = pcap.createSession(adapter.config.interface, {filter: 'arp'});

    pcap_session.on('packet', function (raw_packet) {
        const packet = pcap.decode.packet(raw_packet);
        if (packet.payload.ethertype === 2054) {

            let mac = packet.payload.payload.sender_ha.addr;
            mac = int_array_to_hex(mac);

            const nice_mac = mac.replaceAll(':', '-');
            const needle = mac.slice(0, 8).toString().toUpperCase().split(':').join('');

            adapter.log.debug('needle MAC : ' + needle);

            if (MACs.indexOf(needle) > -1) {

                adapter.getObject(nice_mac, (err, obj) => {
                    // if non existent or not type device
                    if (!obj || obj.type !== 'device') {
                        adapter.setObject(nice_mac, {
                            type: 'device',
                            common: {},
                            native: {}
                        });
                    } // endIf
                });

                adapter.setObjectNotExists(nice_mac + '.pressed', {
                    type: 'state',
                    common: {
                        name: 'Dash button pressed',
                        type: 'boolean',
                        role: 'switch',
                        read: true,
                        write: false
                    }
                });

                adapter.setState(nice_mac + '.pressed', {val: true, ack: true});

                setTimeout(() => {
                    adapter.setState(nice_mac + '.pressed', {val: false, ack: true});
                }, 5000);

                adapter.setObjectNotExists(nice_mac + '.lastPressed', {
                    type: 'state',
                    common: {
                        name: 'Dash button last pressed date',
                        type: 'string',
                        role: 'indicator.date',
                        read: true,
                        write: false
                    }
                });

                adapter.setState(nice_mac + '.lastPressed', {val: (new Date()).toISOString(), ack: true});

                adapter.setObjectNotExists(nice_mac + '.switch', {
                    type: 'state',
                    common: {
                        name: 'Dash button state toggle',
                        type: 'boolean',
                        role: 'switch',
                        read: true,
                        write: false
                    }
                });

                adapter.getState(nice_mac + '.switch', (err, state) => {
                    if (!state || err)
                        adapter.setState(nice_mac + '.switch', {val: false, ack: true});
                    else {
                        const now = new Date();
                        if (now.getTime() - state.lc > 5000) {
                            adapter.setState(nice_mac + '.switch', {val: !state.val, ack: true});
                        }
                    }
                });
            }
        }
    });
}

function remove_duplicates(arr) {
    const obj = {};
    const ret_arr = [];
    for (let i = 0; i < arr.length; i++) {
        obj[arr[i]] = true;
    }
    for (const key in obj) {
        ret_arr.push(key);
    }
    return ret_arr;
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} // endElse
