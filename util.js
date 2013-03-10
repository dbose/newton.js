/*
    All Utility classes goes here

*/

var Mixow = Mixow || {};
Mixow.Utils = {

    // Async javascript load
    loadJSInclude: function(scriptPath, callback) {

        var scriptNode = document.createElement('SCRIPT');
        scriptNode.type = 'text/javascript';
        scriptNode.src = scriptPath;

        var headNode = document.getElementsByTagName('HEAD');
        if (headNode[0] != null)
            headNode[0].appendChild(scriptNode);

        if (callback != null)
        {
            scriptNode.onreadystagechange = callback;
            scriptNode.onload = callback;
        }
    },

    // Augment helper. Used for mixins
    augment: function(receivingClass, givingClass) {
        for(var methodName in givingClass.prototype) {
            if (!receivingClass.prototype[methodName]) {
                receivingClass.prototype[methodName] = givingClass.prototype[methodName];
            }
        }
    },

    log: function(msg) {
      window.console && console.log(msg);
    },

	bind: function(fn, scope){
        return function(){
            return fn.apply(scope, Mixow.Utils.array(arguments));
        };
    },

	array: function (a){
        for(var b=a.length,c=[];b--;)
            c.push(a[b]);
        return c;
    },

    json_encode: function(obj){

        //simple partial JSON encoder implementation
        if(window.JSON && JSON.stringify)
            return JSON.stringify(obj);

        var enc = arguments.callee; //for purposes of recursion

        if(typeof obj == "boolean" || typeof obj == "number") {
          return obj+'' //should work...
        }
        else if(typeof obj == "string") {

        //a large portion of this is stolen from Douglas Crockford's json2.js
        return '"'+
              obj.replace(
                /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g
              , function (a) {
                return '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
              })
              +'"'; //note that this isn't quite as purtyful as the usualness
        }
        else if(obj.length) { //simple hackish test for arrayish-ness
            for(var i = 0; i < obj.length; i++){
              obj[i] = enc(obj[i]); //encode every sub-thingy on top
            }
            return "["+obj.join(",")+"]";
        }
        else {
            var pairs = []; //pairs will be stored here
            for(var k in obj){ //loop through thingys
                pairs.push(enc(k)+":"+enc(obj[k])); //key: value
            }
            return "{"+pairs.join(",")+"}"; //wrap in the braces
        }
    },

    // Taken from Crafty.Extend
    extend: function (obj) {
        var target = this, key;

        //don't bother with nulls
        if (!obj) return target;

        for (key in obj) {
            if (target === obj[key]) continue; //handle circular reference
            target[key] = obj[key];
        }

        return target;
    }

};
