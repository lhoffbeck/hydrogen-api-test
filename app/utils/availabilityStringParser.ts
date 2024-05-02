// This should be added to hydrogen/src/utils

import type {ProductOption} from '@shopify/hydrogen/storefront-api-types';

type ValidOptionValues = number[][];

/**
 * For a set of option values, returns the indices of the option values for the product option set. If an option value is not found, throws an error.
 * @param targetOptionValues - option values to look up in the encoded option value string
 * @param productOptions - product options from the Storefront API
 * @returns
 */
export function getOptionValueIndices(
  targetOptionValues: string[],
  productOptions: Pick<ProductOption, 'name' | 'values'>[],
) {
  return targetOptionValues.map((optionValue, index) => {
    const optionValueIndex =
      productOptions[index]?.values?.indexOf(optionValue);
    if (optionValueIndex === -1) {
      throw new Error(
        `Option value "${optionValue}" not found in product options`,
      );
    }

    return optionValueIndex;
  });
}

/**
 * Determine whether a set of option values is present in an encoded option value string. Function is memoized to retain the last set of decoded option values.
 * @param targetOptionValues - option values to look up in the encoded option value string
 * @param encodedOptionValues - encoded option value string, e.g. response from product.encodedOptionValueAvailability or product.encodedOptionValueAvailability
 * @param productOptions - product options from the Storefront API
 */
export const isOptionValuePresent = (() => {
  const decodedOptionValues = new Map<string, Set<string>>();

  return function (
    targetOptionValues: string[],
    encodedOptionValues: string,
    productOptions: Pick<ProductOption, 'name' | 'values'>[],
  ): boolean {
    if (!decodedOptionValues.has(encodedOptionValues)) {
      // TODO are we worried about the size of this? Should we only store the last 1 encodedOptionValue?
      // decodedOptionValues.clear();
      console.error(decodeOptionValues(encodedOptionValues));
      decodedOptionValues.set(
        encodedOptionValues,
        new Set(
          decodeOptionValues(encodedOptionValues).map((optionValue) =>
            optionValue.join(','),
          ),
        ),
      );
    }

    console.error(decodedOptionValues);

    const optionValueIndices = getOptionValueIndices(
      targetOptionValues,
      productOptions,
    );
    return Boolean(
      decodedOptionValues
        .get(encodedOptionValues)
        ?.has(optionValueIndices.join(',')),
    );
  };
})();

/**
 * For an encoded option value string, decode into option value combinations. Entries represent a valid combination formatted as an array of option value positions.
 * @param encodedOptionValues
 * @returns
 */
export function decodeOptionValues(
  encodedOptionValues: string,
): ValidOptionValues {
  const tokenizer = /[ :,-]/g;
  let index = 0;
  let token: RegExpExecArray | null;
  let options: number[][] = [];
  let cur: number[] = [];
  let depth = 0;
  let range: number | null = null;
  while ((token = tokenizer.exec(encodedOptionValues))) {
    const operation = token[0];
    const optionValuePosition =
      Number.parseInt(encodedOptionValues.slice(index, token.index)) || 0;

    if (range !== null) {
      for (; range < optionValuePosition; range++) {
        cur[depth] = range;
        options.push(cur.slice());
      }
      range = null;
    }

    cur[depth] = optionValuePosition;

    if (operation === '-') {
      range = optionValuePosition;
    } else if (operation === ':') {
      depth++;
    } else {
      const prev = encodedOptionValues[token.index - 1];

      if (operation === ' ' || (operation === ',' && prev !== ',')) {
        options.push(cur.slice());
      }
      if (operation === ',') {
        cur.pop();
        depth--;
      }
    }
    index = tokenizer.lastIndex;
  }
  return options;
}
