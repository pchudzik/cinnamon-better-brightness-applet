const Lang = imports.lang;
const St = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Applet = imports.ui.applet;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;

//TODO make slider changes smooth
 
function MyApplet(orientation) {
    this._init(orientation);
}

MyApplet.prototype = {
	__proto__: Applet.IconApplet.prototype,
 
	_init: function(orientation) {
		Applet.IconApplet.prototype._init.call(this, orientation);
 
		try {
			this.set_applet_icon_symbolic_name('display-brightness-symbolic');
			this.set_applet_tooltip('Adjust screen brightness and stuff');

            this.brightnessManager = new BrightnessManager();
            this.dimManager = new DimManager();

            this.menu = new Applet.AppletPopupMenu(this, orientation);

            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menuManager.addMenu(this.menu);

            this.brightnessSlider = new PopupMenu.PopupSliderMenuItem(0);
            this.brightnessSlider.connect('value-changed', Lang.bind(this, this.brightnessSliderOnChange));
            this.brightnessLabel = new PopupMenu.PopupMenuItem('', {reactive: false});

            this.dimSlider = new PopupMenu.PopupSliderMenuItem(0);
            this.dimSlider.connect('value-changed', Lang.bind(this, this.dimSliderOnChange));
            this.dimLabel = new PopupMenu.PopupMenuItem('', {reactive: false});
            
            this.menu.addMenuItem(new PopupMenu.PopupMenuSection());  
            this.menu.addMenuItem(this.brightnessLabel);
            this.menu.addMenuItem(this.brightnessSlider);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(this.dimLabel);
            this.menu.addMenuItem(this.dimSlider);

            Mainloop.timeout_add(500, Lang.bind(this, this.initApplet));
		}
		catch (e) {
			global.logError(e);
		}
	 }, 
    brightnessSliderOnChange: function(slider, value) {
        this.onBrightnessValueChange(Math.round(value*100));
    },

    sliderValueConverterter: {
        ranges:new Array(
            { from: 0,     to: 0.125, value: 1 },
            { from: 0.125, to: 0.25,  value: 2 },
            { from: 0.25,  to: 0.375, value: 3 },
            { from: 0.375, to: 0.5,   value: 5 },
            { from: 0.5,   to: 0.625, value: 10 },
            { from: 0.625, to: 0.75,  value: 30 },
            { from: 0.75,  to: 0.875, value: 60 },
            { from: 0.875, to: 1.1,   value: 0, sliderValue: 1 }),
        getExpectedSliderValue: function(realSliderValue) {
            return this._findRange(realSliderValue, this._sliderSelector);
        },
        getValue: function(realSliderValue) {
            var result = this._findRange(realSliderValue, function(range) {
                return range.value;
            });
            return result;
        },
        convertToSliderValue: function(value) {
            return this._findRange(0, this._sliderSelector, function(range) {
                return range.value === value;
            });
        },
        _findRange: function(realSliderValue, valueSelector, conditionFunction) {
            if(!conditionFunction) {
                conditionFunction = function() {
                    return range.from <= realSliderValue && realSliderValue < range.to;
                }
            }
            for(var i = 0 ; i < this.ranges.length; i++) {
                var range = this.ranges[i];
                if(conditionFunction(range)) {
                    return valueSelector(range);
                }
            }

            return valueSelector(this.ranges[0]);
        },
        _sliderSelector: function(range) {
            return range.sliderValue ? range.sliderValue : range.from;
        }
    },
    dimSliderOnChange: function(slider, value) {
        this.onDimValueChange( this.sliderValueConverterter.getValue(value));
    },

    initApplet: function() {
        this.brightnessManager.refresh();
        this.onBrightnessValueChange(this.brightnessManager.getBrigtness());

        this.dimManager.refresh();
        this.onDimValueChange(this.dimManager.getDimTimout()/60);

        this.set_applet_tooltip(this.brightnessLabel.label.text + '\n' + this.dimLabel.label.text);
    },

    onBrightnessValueChange: function(value) {
        this.brightnessSlider.setValue(value/100);
        this.brightnessManager.setBrightness(value);
        this.brightnessLabel.label.text = 'Brightness: ' + value + '%';
    },
    onDimValueChange: function(value) {
        this.dimManager.setDimTimout(value*60);
        var sliderValue = this.sliderValueConverterter.convertToSliderValue(value);
        this.dimSlider.setValue(sliderValue);

        this.dimManager.setDimTimout(value*60);
        if(value === 0) {
            this.dimLabel.label.text = 'Screen always ON';
        } else {
            this.dimLabel.label.text = 'Dim timout: ' + value + ' minutes';
        }
    },
    on_applet_clicked: function(event) {
		this.initApplet();
        this.menu.toggle();
	}
};

function BrightnessManager() {
    this._brightness = 100;
    this.refresh();
};
BrightnessManager.prototype = {
    setBrightness:function(brightness) {
        if(brightness !== this._brightness) {
            this._brightness = brightness;
            this._setSystemBrightness(this._brightness);
        }
    },
    getBrigtness: function() {
        return this._brightness;
    },
    refresh: function() {
        this.setBrightness(this._getSystemBrightness());
    },
    _getSystemBrightness: function() {
        let result = 100;

        try {
            var currentBrightness = GLib.spawn_command_line_sync('gdbus call --session ' +
                    '--dest org.gnome.SettingsDaemon ' +
                    '--object-path /org/gnome/SettingsDaemon/Power ' +
                    '--method org.gnome.SettingsDaemon.Power.Screen.GetPercentage')
                .toString();
            //example result of this call is (uint32 4,)
            let tmp = parseInt(currentBrightness.split(' ')[1]);
            if(isNaN(tmp)) {
                global.logError('Error getting brightness value. Received value is: ' + currentBrightness)
            } else {
                result = tmp;
            }
        } catch(e) {
            global.logError(e);
        }

        return result;
    },
    _setSystemBrightness: function() {
        try {
            Util.spawnCommandLine('gdbus call --session ' +
                    '--dest org.gnome.SettingsDaemon ' + 
                    '--object-path /org/gnome/SettingsDaemon/Power ' +
                    '--method org.gnome.SettingsDaemon.Power.Screen.SetPercentage ' + this._brightness);
        } catch(e) {
            global.logError('Cannot set screen bgrightness to value: ' + this._brightness, e);
        }
    }
};

function DimManager() {
    this._dimTimeout = 600;
    this.refresh();
};
DimManager.prototype = {
    refresh: function() {
        this.setDimTimout(this._getSystemDimTimout());
    },
    setDimTimout: function(value) {
        if(this._dimTimeout !== value) {
            this._dimTimeout = value;
            this._setSystemDimTimeout();
        }
    },
    getDimTimout: function() {
        return this._dimTimeout;
    },
    settingsManager: {
        getSystemProperty: function(key) {
            try {
                return GLib.spawn_command_line_sync('gsettings get ' + key).toString();
            } catch(e) {
                global.logError('Can not get system property for key ' + key, e);
            }
        },
        setSystemProperty: function(key, value) {
            try {
                Util.spawnCommandLine('gsettings set ' + key + ' ' + value);
            } catch(e) {
                global.logError('Can not set system property for key ' + key, e);
            }
        }
    },
    _getSystemDimTimout: function() {
        try {
            var timeout = this.settingsManager.getSystemProperty('org.gnome.settings-daemon.plugins.power sleep-display-ac');
            //returned values is eg: "true,2"
            var result = parseInt(timeout.split(',')[1]);
            return parseInt(result);
        } catch(e) {
            global.logError('Can not get system dim timeout.', e);
            return 600;
        }
    },
    _setSystemDimTimeout: function() {
        this.settingsManager.setSystemProperty('org.gnome.settings-daemon.plugins.power sleep-display-ac', this._dimTimeout);
        this.settingsManager.setSystemProperty('org.gnome.settings-daemon.plugins.power sleep-display-battery', this._dimTimeout);
        this.settingsManager.setSystemProperty('org.gnome.desktop.session idle-dealy', this._dimTimeout);
    }
}
 
function main(metadata, orientation) {
	return new MyApplet(orientation);
}