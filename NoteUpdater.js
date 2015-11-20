var Promise = require('bluebird');
var NoteParser = require('./NoteParser.js');

var Throttle = function() {
    this.timeout = null;
    this.future = Promise.defer();
};

Throttle.prototype.restart = function(delay) {
    var _this = this;
    clearTimeout(this.timeout);
    setTimeout(function() {
        _this.future.resolve();
    }, delay || 1000);
    return this.future.promise;
};

var NoteUpdater = function(noteId, noteStore) {
    this.buffer = {};
    this.processing = null;
    this.throttling = null;
    this.noteId = noteId;
    this.noteStore = noteStore;
    this.pendingSave = false;
};

NoteUpdater.prototype.setCheckboxChecked = function(checkbox, checked) {
    this.buffer[checkbox] = checked;
    return this;
};

NoteUpdater.prototype.getNoteParser = function() {
    var future = Promise.defer();

    this.noteStore.getNoteContent(this.noteId, function(err, content) {
        if (err) return future.reject(err);

        NoteParser.parse(content, function(note) {
            future.resolve(note);
        });
    });

    return future.promise;
};

NoteUpdater.prototype.saveNote = function() {
    var _this = this;

    if (!this.throttling && this.processing && !this.pendingSave) {
        this.pendingSave = true;
        return this.processing.then(function() {
            _this.processing = null;
            return _this.saveNote();
        });
    }
    if (this.throttling) {
        return this.throttling.restart(2000);
    }

    this.throttling = new Throttle();
    return this.throttling.restart(2000).bind(this).then(function() {
        this.throttling = null;

        var future = Promise.defer();
        this.processing = future.promise;
        var checkboxes = this.buffer;
        this.pendingSave = false;
        this.buffer = {};

        return this.getNoteParser().bind(this).then(function(note) {
            var shouldSave = false;
            Object.keys(checkboxes).forEach(function(checkbox) {
                var checked = checkboxes[checkbox];
                var changed = note.setCheckboxChecked(checkbox, checked);
                shouldSave = shouldSave || changed;
            });

            if (shouldSave) {
                this.noteStore.getNote(this.noteId, false, false, false, false, function(err, updatedNote) {
                    if (err) return future.reject(err);
                    updatedNote.content = note.xml;

                    _this.noteStore.updateNote(updatedNote, function(err) {
                        if (err) return future.reject(err);
                        future.resolve();
                    });
                });
                return future.promise;
            }

            return Promise.resolve();
        });
    }).finally(function() {
        this.processing = null;
    });
};

NoteUpdater.prototype.hasPendingChanges = function() {
    return this.processing || Object.keys(this.buffer).length > 0
};

module.exports = NoteUpdater;