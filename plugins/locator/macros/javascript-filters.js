/*\
title: $:/plugins/bimlas/locator/macros/javascript-filters.js
type: application/javascript
module-type: filteroperator

Special filters used by Locator

\*/
(function () {

    /*jslint node: true, browser: true */
    /*global $tw: true */
    "use strict";

    function getFieldListingOperator(options, field) {
        var fieldOptions = options.wiki.getTiddler("$:/config/bimlas/locator/fields/" + field);

        return fieldOptions && fieldOptions.fields["field-type"] === "list"
            ? "contains"
            : "field";
    }

    function getFieldDirection(options, field) {
        var fieldOptions = options.wiki.getTiddler("$:/config/bimlas/locator/fields/" + field);

        return (fieldOptions || {fields: {}}).fields["field-direction"];
    }

    function getActiveFilters(options, contextState) {
        var filteredFields = options.wiki.getTiddlerDataCached(contextState, {});
        var results = {};

        $tw.utils.each(filteredFields, function(valuesAsString, field) {
            var values = $tw.utils.parseStringArray(valuesAsString) || [];
            if(values.length) {
                results[field] = values;
            }
        });

        return results;
    }

    function applyFieldsFilters(source, options, contextState, filterFunc) {
        var activeFilters = getActiveFilters(options, contextState);
        var results = source;

        if (!Object.keys(activeFilters).length) return results;

        $tw.utils.each(activeFilters, function (values, field) {
            $tw.utils.each(values, function (value) {
                results = filterFunc(results, field, value);
                results = options.wiki.makeTiddlerIterator(results);
            });
        });

        return results;
    }

    /*
    Filter titles matching to Locator fields filter

    Input: list of tiddlers
    Param: contextState
    Suffix: "recusive" enables recursive filtering
    */
    exports["locator-fields-filter"] = function (source, operator, options) {
        var results = source;
        var filterOperators = options.wiki.getFilterOperators();

        if (operator.suffix === "recursive") {
            results = applyFieldsFilters(results, options, "$:/state/bimlas/locator/search/recursive-filters", recursiveFilterFunc);
        }
        results = applyFieldsFilters(results, options, operator.operand, directFilterFunc);

        return results;

        function directFilterFunc(input, field, value) {
            var fieldListingOperator = getFieldListingOperator(options, field);
            return filterOperators[fieldListingOperator](input, { operand: value, suffix: field }, options);
        }

        function recursiveFilterFunc(input, field, value) {
            var fieldDirection = getFieldDirection(options, field);
            return filterOperators.kin(input, { operand: value, suffixes: [[field], [fieldDirection]] }, options);
        }
    };

    /*
    Filter fields that are not disabled in Locator field options

    Input: list of fields
    Param: none
    */
    exports["locator-enabled-fields"] = function (source, operator, options) {
        var excludedFields = options.wiki.filterTiddlers("[all[system+shadows]field:exclude-from-field-filters[yes]removeprefix[$:/config/bimlas/locator/fields/]]");
        var results = [];

        source(function (tiddler, title) {
            if (excludedFields.indexOf(title) < 0) {
                results.push(title)
            }
        });

        return results;
    };

    /*
    List field values according to Locator field settings

    Input: list of tiddlers
    Param: field
    */
    exports["locator-enlist-field-values"] = function (source, operator, options) {
        var fieldListingOperator = getFieldListingOperator(options, operator.operand);
        var results = [];

        source(function (tiddler, title) {
            if(!tiddler) return;

            var value = tiddler.fields[operator.operand];
            if(fieldListingOperator === "contains") {
                value = $tw.utils.parseStringArray(value);
            }

            if(!value) return;

            results = $tw.utils.pushTop(results,value);
        });

        return results;
    };

    /*
    List of active field filters

    Input: contextState - TODO: Cannot use variable as filter suffix?
    Param (optional): field
    */
    exports["locator-selected-field-values"] = function (source, operator, options) {
        var activeFilters = {};

        source(function (tiddler, title) {
            activeFilters = getActiveFilters(options, title);
        });

        if (!Object.keys(activeFilters).length) return [];

        return operator.operand 
            ? activeFilters[operator.operand] || []
            : ["TODO: Join active filter values (array of arrays)"];
    };

    /*
    List children of input elements based on selected relationship field

    Input: parent tiddlers
    Param: contextState
    */
    exports["locator-enlist-children"] = function (source, operator, options) {
        var contextState = options.wiki.getTiddler(operator.operand) || {fields: []};
        var fieldOfRelationship = contextState.fields["field-of-relationship"] || "tags";
        var fieldSettings = options.wiki.getTiddler("$:/config/bimlas/locator/fields/" + fieldOfRelationship) || {fields: []};
        var shouldFindListings = (fieldSettings.fields["field-direction"] || "to") === "to";
        if(contextState.fields["invert-direction"] === "yes") {
            shouldFindListings = !shouldFindListings;
        }
        var results = [];

        source(function (tiddler, title) {
            results = $tw.utils.pushTop(results, shouldFindListings
                ? options.wiki.findListingsOfTiddler(title, fieldOfRelationship)
                : options.wiki.getTiddlerList(title, fieldOfRelationship)
            );
        });

        return results;
    };

})();
