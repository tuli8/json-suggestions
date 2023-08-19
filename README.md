# jsonsuggestions README

This extension is for learning patterns in json files and suggesting auto competions for them.
it is intended for the ecix framework.

## Features

Using the extension, first, teach the extension the json rules of the framework. 
You can build a context file by running the command `> build context file` in the top command line.

Then choose the path to your folder of projects (usually release-schemas).

A schemasAutocompleteTemplate.json file will be created including the rules for the schemas.
Then editing a json file in a project will make suggestions based on the scope of your cursor in the json and the rules infered from the other projects.

Completion options can be brought up be pressing `Ctrl+Space` or any of the triggering characters (`{`,`[`,`:`,`Enter` or `,`).
Notice that all of the suggestions made by this extension will be marked with the lightning bolt symbol.

Made by Stav.S.

# Enjoy!
