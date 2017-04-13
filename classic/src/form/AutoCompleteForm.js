/**
 * conjoon
 * (c) 2007-2016 conjoon.org
 * licensing@conjoon.org
 *
 * lib-cn_comp
 * Copyright (C) 2016 Thorsten Suckow-Homberg/conjoon.org
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * This is the base class for forms that wish to utilize autocomplete functionality,
 * such as authentication forms.
 * This form will basically set the autocomplete attribute of it's child textfield
 * items to true but those which have disabled autcomplete.
 * Additionally, this form will also focus the first visible, enabled and empty
 * textfield that can be found after the form was rendered.
 * To set the autocomplete attribute of nested textfields to "off", configure
 * these fields with "autoComplete: false".
 *
 * This class can also tigger autocompletion when the form is not used
 * with the basic {@link #Ext.form.Action}-classes, for example, when the values
 * of the form should be processed in custom code rather than a standard/direct
 * form-submit. Specify {@link #autoCompleteTrigger} to an object containing
 * an actionUrl and a button-reference whenever instances of
 * this class do not use calls to {@link Ext.form.Panel#submit}.
 * This component will then render a hidden input-button with its type set to
 * "submit" which will be used to create an automatic submit. A specific form
 * listener will then prevent the default action for the submit event and POST
 * data via a XMLHttpRequest to the configured #actionUrl.
 * This is necessary so the browser get notified of a form submit and save those
 * values which are - in the most cases - a pair of user credentials.
 * The action-url for the form can be specified in
 * {@link #autoCompleteTrigger}.actionUrl and should be an existing local file.
 * By default, this package's "resources/html/blank.html" will be used.
 * No further form-data is needed by this html-page, it serves solely as a POST
 * target for the submit button andthe created XMLHttpRequest - a status code
 * of 200 is required, notifying the browser that autocomplete values can be saved.
 * In order for the fake form-submit and the autocomplete to work, implementing
 * classes need to specify a button reference via {@link #autoCompleteTrigger}.reference.
 * This class will then add a click-listener to this button and run the fake
 * submit-process as soon as the button was clicked. Implementing classes should
 * make sure that clicking this button is only possible once form-data has been
 * validated.
 *
 *      @example
 *      Ext.define('MyApp.AutoCompleteForm', {
 *
 *          extend : 'conjoon.cn_comp.form.AutoCompleteForm',
 *
 *          autoCompleteTrigger : {
 *              reference : 'submitButton',
 *              actionUrl : './resources/html/blank.html',
 *          },
 *
 *          items : [{
 *              xtype      : 'textfield',
 *              name       : 'name',
 *              fieldLabel : 'Name',
                allowBlank : false
 *          }],
 *
 *          buttons : [{
 *              // clicking this button will trigger  the "autocomplete"
 *              // functionality of browsers by submitting the form into a
 *              // hidden iframe, since "autoCompleteTrigger" was configured
 *              // with this button's reference.
 *              reference : 'submitButton',
 *              formBind  : true,
 *              text      : "Submit",
 *              handler   : function(btn) {
 *                   console.log(btn.up('form').getValues());
 *              }
 *          }]
 *
 *      });
 *
 *
 */
Ext.define('conjoon.cn_comp.form.AutoCompleteForm', {

    extend : 'Ext.form.Panel',

    xtype : 'cn_comp-autocompleteform',

    referenceHolder : true,

    /**
     * Seek out the first enabled, focusable, empty textfield when the form is focused
     */
    defaultFocus: 'textfield:focusable:not([hidden]):not([disabled]):not([value])',

    /**
     * @cfg {String} formName
     * The name for the form used as the name attribute for the <form>-tag
     */
    formName : undefined,

    /**
     * @type {Boolean/Object} [autoCompleteTrigger=false]
     * false to not trigger autocomplete by faking a form submit into a hidden
     * iframe, or
     * {String} autoCompleteTrigger.actionUrl The url to which the fake post
     * of the XMLHttpRequest should happen. Will default to {@link #defaultFakeActionUrl}
     * if not specified.
     * {String} autoCompleteTrigger.reference The reference of the button that
     * triggers the fake submit/autocomplete. This class will automatically
     * create a "click" listener for this button.
     */
    autoCompleteTrigger : false,

    /**
     * @cfg {String} [defaultFakeActionUrl=./resources/html/blank.html]
     * The default action url to use with the fake iframe if autoCompleteTrigger
     * is configured as an object, but missing the actionUrl property.
     */
    defaultFakeActionUrl : './resources/html/blank.html',

    /**
     * @type {HtmlElement}
     * @private
     */
    submitHelperButton : null,

    /**
     * For Chrome, this will hold a native HTMLElement referencing an input field
     * which has to be created in order for Chrome's "save form data" dialog
     * to appear.
     * @type {HTMLElement}
     * @private
     */
    currentRogueField : null,

    /**
     * @inheritdoc
     *
     * @throws exception if autoCompleteTrigger was not properly configured
     */
    initComponent: function () {

        var me         = this,
            listen     = {},
            cfgObject  = null;

        // Use standard FORM tag for detection by browser or password tools
        cfgObject = {
            tag    : 'form',
            method : 'post'
        };

        if (me.formName) {
            cfgObject.name = me.formName;
        }

        me.autoEl = Ext.applyIf(me.autoEl || {}, cfgObject);

        me.callParent();

        listen = {
            render : 'doAutoComplete',
            scope  : me,
            single : true
        };

        Ext.each(me.query('textfield'), function (field) {
            field.on(listen);
        });

        if (me.autoCompleteTrigger !== false) {
            me.sanitizeAutoCompleteTrigger(me.autoCompleteTrigger);
            me.on('afterrender', me.createFakeSubmitHelper, me, {single : true});
        }
    },


    privates : {

        /**
         * Additional check for this forms configuration, mainly for the
         * {@link #autoCompleteTrigger} configuration that gets passed to this
         * method.
         *
         * @param {Object} options
         *
         * @return {Object} returns an object that should be applied to this
         * form's {@link Ext.form.Panel#autoEl}.
         *
         * @throws error if autoCompleteTrigger is not false and properly configured
         * with actionUrl and reference
         */
        sanitizeAutoCompleteTrigger : function(options) {

            var me = this;

            if (!options.actionUrl ||
                !Ext.isString(options.actionUrl)) {
                options.actionUrl = me.defaultFakeActionUrl;
            }

            if (!options.actionUrl || !options.reference ||
                !Ext.isString(options.actionUrl) || !Ext.isString(options.reference)) {
                Ext.raise({
                    sourceClass : Ext.getClassName(this),
                    actionUrl   : options.actionUrl,
                    reference   : options.reference,
                    msg         : Ext.getClassName(this) + " needs actionUrl and reference to be configured as strings"
                });
            }

            return {
                actionUrl : options.actionUrl
            };
        },

        /**
         * Adds autocomplete attributes to the specified textfield
         *
         * @param {Ext.form.field.Text} field
         */
        doAutoComplete : function(field) {
            var me = this;

            if (field.inputEl && field.autoComplete !== false) {
                field.inputEl.set({ autocomplete: 'on' });
            }
        },

        /**
         * Creates fake submit elements if this form should not use the default
         * submit() functionality.
         *
         * @throws error if the reference specified in {@link #autoCompleteTrigger}.reference
         * cannot be found.
         */
        createFakeSubmitHelper : function() {

            var me  = this,
                btn = me.lookup(me.autoCompleteTrigger.reference);

            if (!btn) {
                Ext.raise({
                    sourceClass : Ext.getClassName(this),
                    reference   : me.autoCompleteTrigger.reference,
                    msg         : Ext.getClassName(this) + "#autoCompleteTrigger (Object) needs reference to be representing an existing component"
                });
                return;
            }

            me.submitHelperButton = Ext.DomHelper.append(
                me.el.dom,
                {tag : 'input', type : 'submit', style : 'display:none'}
            );

            Ext.fly(me.el.dom).on('submit', me.onDomFormSubmit, me);

            btn.on('click', me.triggerFakeSubmit, me);
        },

        /**
         * Callback for the native {Form] wrapped by this Ext Element to make
         * sure the browser's "save form data" dialog is triggered.
         *
         * @param {Ext.Event} evt
         *
         * @returns {boolean} false
         */
        onDomFormSubmit : function(evt) {

            var me   = this,
                form, p, input;

            evt.preventDefault();

            if (Ext.isChrome) {
                var form  = me.el.dom,
                    p     = form.parentNode,
                    input = me.currentRogueField;
                if (input) {
                    form.removeChild(input);
                }

                input                 = document.createElement('input');
                me.currentRogueField  = input;
                input.id              = Ext.id();
                me.el.dom.appendChild(input);
            }

            var request = new XMLHttpRequest();
            request.open('POST', me.autoCompleteTrigger.actionUrl, true);
            request.send();

            return false;
        },

        /**
         * Triggers a fake submit
         *
         * @throws error if neither the button referenced via {@link #submitButtonId}
         * or the iframe referenced via {@link #iframeId} can be found.
         */
        triggerFakeSubmit : function() {

            var me  = this,
                btn = me.submitHelperButton;

            if (!btn) {
                Ext.raise({
                    sourceClass : Ext.getClassName(this),
                    msg         : Ext.getClassName(this) + " cannot find the fake submit button"
                });
            }

            btn.click();
        }

    }

});
