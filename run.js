var vectorWatch = require('stream-dev-tools');
var evernote = require('evernote');
var Evernote = evernote.Evernote;
var NoteParser = require('./NoteParser.js');
var NoteUpdater = require('./NoteUpdater.js');
var Promise = require('bluebird');
var mysql = require('mysql');
var util = require('util');

var connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'EvernoteTestApp'
});
connection.connect();

var vectorStream = vectorWatch.createStreamNode({
    streamUID: process.env.STREAM_UID,
    token: process.env.VECTOR_TOKEN,

    auth: {
        protocol: 'OAuth',
        version: '1.0',

        consumerKey: process.env.EVERNOTE_KEY,
        consumerSecret: process.env.EVERNOTE_SECRET,

        callbackUrl: 'http://vectorwatch-srv.cloudapp.net/evernote-app/oauth_callback',
        requestTokenUrl: 'https://www.evernote.com/oauth',
        accessTokenUrl: 'https://www.evernote.com/oauth',

        authorizeUrl: 'https://www.evernote.com/OAuth.action'
    },

    database: {
        connection: connection
    }
});
vectorStream.debugMode = true;

var getCheckboxIdByNoteIdAndLabel = function(noteId, label) {
    var future = Promise.defer();

    connection.query('INSERT IGNORE INTO CheckboxMapping (noteId, label) VALUES (?, ?)', [noteId, label], function(err) {
        if (err) return future.reject(err);

        connection.query('SELECT id FROM CheckboxMapping WHERE noteId = ? AND label = ?', [noteId, label], function(err, records) {
            if (err) return future.reject(err);
            future.resolve(((records || [])[0] || {}).id);
        });
    });

    return future.promise;
};

var getCheckboxLabelIdMappingForNoteAndLabels = function(noteId, labels) {
    if (labels.length == 0) return Promise.resolve({});

    var future = Promise.defer();

    connection.query('INSERT IGNORE INTO CheckboxMapping (noteId, label) VALUES ?', [labels.map(function(label) {
        return [noteId, label];
    })], function(err) {
        if (err) return future.reject(err);

        connection.query('SELECT id, label FROM CheckboxMapping WHERE noteId = ? AND label IN (?)', [noteId, labels], function(err, records) {
            if (err) return future.reject(err);

            var mapping = {};
            (records || []).forEach(function(record) {
                mapping[record.label] = record.id;
            });

            future.resolve(mapping);
        });
    });

    return future.promise;
};

var getNoteIdAndLabelByCheckboxId = function(id) {
    var future = Promise.defer();

    connection.query('SELECT noteId, label FROM CheckboxMapping WHERE id = ?', [id], function(err, records) {
        if (err) return future.reject(err);

        return future.resolve((records || [])[0]);
    });

    return future.promise;
};

var getNoteStringIdMappingForStrings = function(noteStrings) {
    if (noteStrings.length == 0) return Promise.resolve({});

    var future = Promise.defer();

    connection.query('INSERT IGNORE INTO NoteMapping (string) VALUES ?', [noteStrings.map(function(string) { return [string]; })], function(err) {
        if (err) return future.reject(err);

        connection.query('SELECT id, string FROM NoteMapping WHERE string IN (?)', [noteStrings], function(err, records) {
            if (err) return future.reject(err);

            var mapping = {};
            (records || []).forEach(function(record) {
                mapping[record.string] = record.id;
            });

            future.resolve(mapping);
        });
    });

    return future.promise;
};

var getNoteStringById = function(id) {
    var future = Promise.defer();

    connection.query('SELECT string FROM NoteMapping WHERE id = ?', [id], function(err, records) {
        if (err) return future.reject(err);

        future.resolve(((records || [])[0] || {}).string);
    });

    return future.promise;
};

vectorStream.requestConfig = function(resolve, reject, authTokens) {
    resolve({
        renderOptions: {},
        settings: {},
        defaults: {}
    });
};

vectorStream.callMethod = function(resolve, reject, methodName, args, authTokens) {
    if (!authTokens) {
        return reject(new Error('Invalid auth tokens.'), 901);
    }

    callMethod(methodName, args, authTokens).then(resolve).catch(function(err) {
        return err instanceof Evernote.EDAMUserException;
    }, function(err) {
        reject(err, 901);
    }).catch(function(err) {
        console.log(util.inspect(err, { colors: true, depth: null }));
        reject(err);
    });
};

var callMethod = function(methodName, args, authTokens) {
    if (!RemoteMethods[methodName]) {
        return Promise.reject(new Error('Invalid method name.'));
    }

    //if (RemoteMethods[methodName].length != args.length + 1) {
    //    return Promise.reject(new Error('Invalid number of parameters.'));
    //}

    var client = new Evernote.Client({
        token: authTokens.oauth_access_token,
        sandbox: false
    });

    return RemoteMethods[methodName].call(null, client, args);
};
var NoteUpdaterCache = {};
var RemoteMethods = {
    loadNotes: function(client) {
        var future = Promise.defer();

        var noteStore = client.getNoteStore();
        noteStore.findNotesMetadata(new Evernote.NoteFilter({
            order: Evernote.NoteSortOrder.UPDATED,
            ascending: false
        }), 0, 50, new Evernote.NotesMetadataResultSpec({
            includeTitle: true,
            includeUpdated: true
        }), function(err, notesMetadataList) {
            if (err) return future.reject(err);

            var promises = notesMetadataList.notes.map(function(noteMetadata) {
                return getNote(noteMetadata.guid, noteStore).then(function(note) {
                    return {
                        id: noteMetadata.guid,
                        title: noteMetadata.title,
                        note: note
                    };
                });
            });

            Promise.filter(promises, function(note) {
                return Object.keys(note.note.checkboxes).length > 0;
            }).then(function(notes) {
                return getNoteStringIdMappingForStrings(notes.map(function(note) {
                    return note.id;
                })).then(function(mapping) {
                    future.resolve({
                        type: 'list',
                        items: notes.map(function(note) {
                            return {
                                type: 'text',
                                id: mapping[note.id],
                                label: note.title
                            };
                        })
                    });
                });
            }).catch(function(err) {
                future.reject(err);
            });
        });

        return future.promise;
    },

    loadItems: function(client, options) {
        return getNoteStringById(options.id).then(function(noteString) {
            var noteStore = client.getNoteStore();
            return getNote(noteString, noteStore).then(function(note) {
                return getCheckboxLabelIdMappingForNoteAndLabels(noteString, Object.keys(note.checkboxes)).then(function (mapping) {

                    var labels = Object.keys(note.checkboxes);
                    var results = [];

                    labels.forEach(function(label) {
                        if (mapping[label]) {
                            var checkbox = note.checkboxes[label];
                            results.push({
                                type: 'checkbox',
                                id: mapping[label],
                                label: checkbox.label,
                                checked: checkbox.checked ? 1 : 0
                            });
                        }
                    });

                    return results;
                });
            });
        }).then(function(items) {
            return {
                type: 'list',
                items: items
            };
        });
    },

    getListName: function(client, options) {
        return getNoteStringById(options.id).then(function(noteString) {
            var noteStore = client.getNoteStore();
            var future = Promise.defer();

            noteStore.getNote(noteString, false, false, false, false, function(err, note) {
                if (err) return future.reject(err);
                future.resolve(note.title);
            });

            return future.promise;
        }).then(function(name) {
            return {
                type: 'text_element',
                value: name
            };
        });
    },

    setCheckedElement: function(client, options) {
        return getNoteIdAndLabelByCheckboxId(options.id).then(function(checkbox) {
            if (!checkbox) return Promise.reject(new Error('Invalid checkbox id supplied.'));

            var noteId = checkbox.noteId;
            var checkboxId = checkbox.label;
            var checked = Number(options.value) ? true : false;

            if (!NoteUpdaterCache[noteId]) {
                NoteUpdaterCache[noteId] = new NoteUpdater(noteId, client.getNoteStore());
            }

            NoteUpdaterCache[noteId].setCheckboxChecked(checkboxId, checked).saveNote().finally(function() {
                if (NoteUpdaterCache[noteId] && !NoteUpdaterCache[noteId].hasPendingChanges()) {
                    delete NoteUpdaterCache[noteId];
                }
            });
        });
    }
};

var getNote = function(guid, noteStore) {
    var future = Promise.defer();

    noteStore.getNoteContent(guid, function(err, content) {
        if (err) return future.reject(err);

        NoteParser.parse(content, function(note) {
            future.resolve(note);
        });
    });

    return future.promise;
};


vectorStream.startStreamServer(3030, function() {
    console.log('Evernote stream server started.');
});