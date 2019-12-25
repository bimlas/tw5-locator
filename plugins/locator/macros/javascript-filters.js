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

    function buildTiddlerFilter(options, contextState) {
        var activeFilters = getActiveFilters(options, contextState);
        var results = "";

        $tw.utils.each(activeFilters, function (filteredValues, field) {
            var fieldListingOperator = getFieldListingOperator(options, field);
            $tw.utils.each(filteredValues, function (value) {
                results += fieldListingOperator + ":" + field + "[" + value + "]"
            });
        });

        return results
            ? "[" + results + "]"
            : "";
    }

    /*
    Filter titles matching to Locator fields filter

    Input: list of tiddlers
    Param: contextState
    */
    exports["locator-fields-filter"] = function (source, operator, options) {
        var tiddlerFilter = buildTiddlerFilter(options, operator.operand);
        var results = [];

        if(!tiddlerFilter) {
            source(function (tiddler, title) {
                results.push(title);
            });
        } else {
            var allMatchingTiddlers = options.wiki.filterTiddlers(tiddlerFilter);
            source(function (tiddler, title) {
                if(allMatchingTiddlers.indexOf(title) >= 0) {
                    results.push(title)
                }
            });
        }

        return results;
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
        var shouldFindListings = (fieldSettings.fields["direction-of-field"] || "to") === "to";
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
