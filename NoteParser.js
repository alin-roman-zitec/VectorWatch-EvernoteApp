var sax = require('sax');

var Note = function Note(xml, callback) {
    var _this = this;

    this.xml = xml;
    this.parser = sax.parser(false, {
        trim: true,
        normalize: true,
        lowercase: true,
        xmlns: true,
        position: true
    });

    this.currentCheckbox = null;
    this.checkboxes = {};

    this.parser.onerror = function(e) {
        _this.parser.resume();
    };

    this.parser.onopentag = function(node) {
        if (node.name == 'en-todo') {
            privateMethods.newCheckbox.call(_this, node.attributes.checked ? true : false);
        } else if (node.name == 'div') {
            privateMethods.closeCheckbox.call(_this);
        } else if (node.name == 'br') {
            privateMethods.closeCheckbox.call(_this);
        }
    };

    this.parser.onclosetag = function(tagName) {
        if (tagName == 'div') {
            privateMethods.closeCheckbox.call(_this);
        }
    };

    this.parser.ontext = function(text) {
        privateMethods.updateLabel.call(_this, text);
    };

    this.parser.oncdata = function(text) {
        privateMethods.updateLabel.call(_this, text);
    };

    this.parser.onend = function() {
        callback && callback();
    };

    this.parser.write(this.xml);
    this.parser.end();
};

Note.prototype.setCheckboxChecked = function(checkboxId, checked) {
    if (!this.checkboxes[checkboxId]) throw new Error('Invalid checkbox id supplied.');

    if (this.checkboxes[checkboxId].checked == checked) {
        return false;
    }

    var _this = this;
    var position = this.checkboxes[checkboxId].position;
    var firstPartReversed = this.xml.substr(0, position).split('').reverse().join('');
    var tagLength = firstPartReversed.match(/^.*?odot-ne\</)[0].length;
    var selfClosing = firstPartReversed[1] == '/';
    var tagEnding = selfClosing ? '/>' : '>';
    var newTag = (checked ? '<en-todo checked="true"' : '<en-todo') + tagEnding;
    var lengthDiff = newTag.length - tagLength;
    this.xml = this.xml.substr(0, position - tagLength) + newTag + this.xml.substr(position);

    Object.keys(this.checkboxes).forEach(function(checkboxId) {
        if (_this.checkboxes[checkboxId].position >= position) {
            _this.checkboxes[checkboxId].position += lengthDiff;
        }
    });

    return true;
};

var privateMethods = {
    newCheckbox: function(checked) {
        privateMethods.closeCheckbox.call(this);
        this.currentCheckbox = {
            label: '',
            value: '',
            position: this.parser.position,
            checked: checked
        };
        return this;
    },
    updateLabel: function(string) {
        if (this.currentCheckbox == null) return;
        this.currentCheckbox.label += string;
        return this;
    },
    closeCheckbox: function() {
        if (this.currentCheckbox == null) return;

        if (this.currentCheckbox.label.trim() == '') {
            this.currentCheckbox = null;
            return;
        }

        var hash, index = 0, hex;
        do {
            hash = require('crypto').createHash('md5');
            hash.update(this.currentCheckbox.label + '-' + index++);
            hex = hash.digest('hex');
        } while (this.checkboxes[hex] != null);

        this.currentCheckbox.value = hex;
        this.checkboxes[hex] = this.currentCheckbox;
        this.currentCheckbox = null;
        return this;
    }
};

module.exports = {
    parse: function(xml, callback) {
        var note = new Note(xml, function() {
            process.nextTick(function() {
                callback && callback(note);
            });
        });
    }
};