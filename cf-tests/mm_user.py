MM = """flowchart TD
    U[Users] --> LB[Load Balancer]

    subgraph WEB[Web Tier - 12 servers]
        direction LR
        W01[WEB01] ~~~ W02[WEB02] ~~~ W03[WEB03] ~~~ W04[WEB04] ~~~ W05[WEB05] ~~~ W06[WEB06]
        W07[WEB07] ~~~ W08[WEB08] ~~~ W09[WEB09] ~~~ W10[WEB10] ~~~ W11[WEB11] ~~~ W12[WEB12]
    end

    subgraph APP[App Tier - 12 servers]
        direction LR
        A01[APP01] ~~~ A02[APP02] ~~~ A03[APP03] ~~~ A04[APP04] ~~~ A05[APP05] ~~~ A06[APP06]
        A07[APP07] ~~~ A08[APP08] ~~~ A09[APP09] ~~~ A10[APP10] ~~~ A11[APP11] ~~~ A12[APP12]
    end

    subgraph DB[Database Tier - 6 servers]
        direction LR
        D01[(DB01 Primary)] ~~~ D02[(DB02 Replica)] ~~~ D03[(DB03 Replica)]
        D04[(DB04 Primary)] ~~~ D05[(DB05 Replica)] ~~~ D06[(DB06 Replica)]
    end

    LB --> WEB
    WEB --> APP
    APP --> DB

    classDef web fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef app fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef db fill:#fef3c7,stroke:#d97706,color:#78350f
    class W01,W02,W03,W04,W05,W06,W07,W08,W09,W10,W11,W12 web
    class A01,A02,A03,A04,A05,A06,A07,A08,A09,A10,A11,A12 app
    class D01,D02,D03,D04,D05,D06 db"""
NOTE = "# Infra\n\n```mermaid\n" + MM + "\n```\n"
