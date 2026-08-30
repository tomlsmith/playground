import { useMemo } from "react";

import type { TokenSpan } from "../contracts";
import { tokenLexemes } from "../highlight";
import { useI18n } from "../i18n";

interface TokenLedgerProps {
  source: string;
  tokens: readonly TokenSpan[];
}

export function TokenLedger({ source, tokens }: TokenLedgerProps) {
  const { messages } = useI18n();
  const lexemes = useMemo(
    () => tokenLexemes(source, tokens),
    [source, tokens],
  );

  if (tokens.length === 0) {
    return <div className="token-ledger">{messages.tokenLedger.empty}</div>;
  }

  return (
    <div className="token-ledger">
      <table>
        <thead>
          <tr>
            <th>{messages.tokenLedger.kind}</th>
            <th>{messages.tokenLedger.bytes}</th>
            <th>{messages.tokenLedger.lexeme}</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token, index) => (
            <tr key={`${token.range.start}:${token.range.end}:${index}`}>
              <td>{messages.tokenLedger.tokenKinds[token.kind]}</td>
              <td>
                {token.range.start}–{token.range.end}
              </td>
              <td>
                <code>{(lexemes[index] ?? "").replaceAll("\n", "↵")}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
